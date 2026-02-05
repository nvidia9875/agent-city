import { GoogleAuth } from "google-auth-library";

const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

const getAccessToken = async () => {
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token =
    typeof tokenResponse === "string" ? tokenResponse : tokenResponse?.token;
  if (!token) {
    throw new Error("Failed to get access token for Vertex AI");
  }
  return token;
};

const getProject = () =>
  process.env.GCP_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.NEXT_PUBLIC_GCP_PROJECT_ID;

const resolveEmbedLocation = () =>
  process.env.VERTEX_EMBED_LOCATION || process.env.GCP_REGION || "us-central1";

const getEndpointHost = (location: string) =>
  location === "global" ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`;

const DEFAULT_EMBED_COOLDOWN_MS = 5 * 60_000;
const LOG_THROTTLE_MS = 60_000;

const resolveEmbedCooldownMs = () => {
  const raw = process.env.VERTEX_EMBED_COOLDOWN_MS;
  if (!raw) return DEFAULT_EMBED_COOLDOWN_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_EMBED_COOLDOWN_MS;
  return parsed;
};

let embedCooldownUntil = 0;
let lastCooldownLogAt = 0;

const isRateLimitResponse = (status: number, bodyText: string) => {
  if (status === 429) return true;
  try {
    const parsed = JSON.parse(bodyText) as {
      error?: { code?: number; status?: string };
    };
    if (parsed?.error?.code === 429) return true;
    if (parsed?.error?.status === "RESOURCE_EXHAUSTED") return true;
  } catch {
    // Ignore JSON parse failures.
  }
  const lowered = bodyText.toLowerCase();
  return (
    lowered.includes("resource_exhausted") ||
    lowered.includes("quota") ||
    lowered.includes("rate limit")
  );
};

const startEmbedCooldown = () => {
  const cooldownMs = resolveEmbedCooldownMs();
  if (cooldownMs <= 0) return;
  embedCooldownUntil = Date.now() + cooldownMs;
  const now = Date.now();
  if (now - lastCooldownLogAt > LOG_THROTTLE_MS) {
    console.warn(
      `[embedding] rate limited; skipping embeddings for ${Math.round(cooldownMs / 1000)}s`
    );
    lastCooldownLogAt = now;
  }
};

export const embedText = async (text: string): Promise<number[] | null> => {
  if (embedCooldownUntil > Date.now()) {
    return null;
  }
  const project = getProject();
  const model = process.env.VERTEX_EMBED_MODEL || "gemini-embedding-001";
  const location = resolveEmbedLocation();
  const outputDimensionality = process.env.VERTEX_EMBED_DIM
    ? Number(process.env.VERTEX_EMBED_DIM)
    : undefined;

  if (!project) {
    throw new Error("GCP_PROJECT_ID is not set");
  }

  const token = await getAccessToken();
  const host = getEndpointHost(location);
  const url = `https://${host}/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:predict`;
  const parameters: Record<string, unknown> = {
    autoTruncate: true,
  };
  if (outputDimensionality) {
    parameters.outputDimensionality = outputDimensionality;
  }
  const body: Record<string, unknown> = {
    instances: [{ content: text }],
    parameters,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    if (isRateLimitResponse(res.status, errorText)) {
      startEmbedCooldown();
      return null;
    }
    throw new Error(`Embedding request failed: ${res.status} ${errorText}`);
  }

  const data = (await res.json()) as {
    predictions?: Array<{ embeddings?: { values?: number[] } }>;
    embedding?: { values?: number[] };
    embeddings?: Array<{ values?: number[] }>;
  };

  const vector =
    data.predictions?.[0]?.embeddings?.values ??
    data.embedding?.values ??
    data.embeddings?.[0]?.values;
  if (!vector) {
    throw new Error("Embedding response missing vector values");
  }

  return vector;
};
