import { GoogleAuth } from "google-auth-library";

const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

const getAccessToken = async () => {
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token) {
    throw new Error("Failed to get access token for Vertex AI");
  }
  return token;
};

const getProject = () =>
  process.env.GCP_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.NEXT_PUBLIC_GCP_PROJECT_ID;

export const embedText = async (text: string) => {
  const project = getProject();
  const location = process.env.GCP_REGION || "us-central1";
  const model = process.env.VERTEX_EMBED_MODEL || "gemini-embedding-001";
  const outputDimensionality = process.env.VERTEX_EMBED_DIM
    ? Number(process.env.VERTEX_EMBED_DIM)
    : undefined;

  if (!project) {
    throw new Error("GCP_PROJECT_ID is not set");
  }

  const token = await getAccessToken();
  const url = `https://aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:embedContent`;
  const body: Record<string, unknown> = {
    content: { parts: [{ text }] },
    taskType: "RETRIEVAL_DOCUMENT",
  };

  if (outputDimensionality) {
    body.outputDimensionality = outputDimensionality;
  }

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
    throw new Error(`Embedding request failed: ${res.status} ${errorText}`);
  }

  const data = (await res.json()) as {
    embedding?: { values?: number[] };
    embeddings?: Array<{ values?: number[] }>;
  };

  const vector = data.embedding?.values ?? data.embeddings?.[0]?.values;
  if (!vector) {
    throw new Error("Embedding response missing vector values");
  }

  return vector;
};
