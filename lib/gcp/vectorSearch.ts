import { GoogleAuth } from "google-auth-library";

const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

const getAccessToken = async () => {
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token) {
    throw new Error("Failed to get access token for Vector Search");
  }
  return token;
};

const getProject = () =>
  process.env.GCP_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.NEXT_PUBLIC_GCP_PROJECT_ID;

export type VectorUpsertPayload = {
  id: string;
  vector: number[];
  metadata?: Record<string, string | number | boolean>;
};

export const upsertVector = async (payload: VectorUpsertPayload) => {
  const project = getProject();
  const location = process.env.VERTEX_VECTOR_LOCATION || process.env.GCP_REGION || "us-central1";
  const indexId = process.env.VERTEX_VECTOR_INDEX_ID;

  if (!project) {
    throw new Error("GCP_PROJECT_ID is not set");
  }
  if (!indexId) {
    throw new Error("VERTEX_VECTOR_INDEX_ID is not set");
  }

  const token = await getAccessToken();
  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/indexes/${indexId}:upsertDatapoints`;

  const datapoint: Record<string, unknown> = {
    datapointId: payload.id,
    featureVector: payload.vector,
  };

  if (payload.metadata && Object.keys(payload.metadata).length > 0) {
    datapoint.restricts = Object.entries(payload.metadata).map(([key, value]) => ({
      namespace: key,
      allow: [String(value)],
    }));
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ datapoints: [datapoint] }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Vector upsert failed: ${res.status} ${errorText}`);
  }

  return res.json();
};
