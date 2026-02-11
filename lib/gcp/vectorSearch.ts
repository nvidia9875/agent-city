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

export type VectorNeighbor = {
  id: string;
  distance: number;
};

const getVectorLocation = () =>
  process.env.VERTEX_VECTOR_LOCATION || process.env.GCP_REGION || "us-central1";

const parseResourceId = (value?: string) => {
  if (!value) return "";
  const trimmed = value.trim();
  const parts = trimmed.split("/");
  return parts[parts.length - 1] ?? trimmed;
};

const getIndexEndpointId = () => parseResourceId(process.env.VERTEX_VECTOR_ENDPOINT_ID);
const getConfiguredDeployedIndexId = () =>
  parseResourceId(process.env.VERTEX_VECTOR_DEPLOYED_INDEX_ID);
const getConfiguredIndexId = () => parseResourceId(process.env.VERTEX_VECTOR_INDEX_ID);

type EndpointInfo = {
  publicEndpointDomain: string | null;
  deployedIndexes: Array<{ id: string; indexId?: string }>;
};

let cachedEndpointInfo: EndpointInfo | null = null;

const normalizeDeployedIndexes = (value: unknown): EndpointInfo["deployedIndexes"] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const deployed = item as Record<string, unknown>;
      const id = parseResourceId(
        (typeof deployed.id === "string" && deployed.id) ||
          (typeof deployed.deployedIndexId === "string" && deployed.deployedIndexId) ||
          (typeof deployed.deployed_index_id === "string" &&
            deployed.deployed_index_id) ||
          undefined
      );
      if (!id) return null;
      const indexId = parseResourceId(
        typeof deployed.index === "string" ? deployed.index : undefined
      );
      return { id, indexId: indexId || undefined };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
};

const getEndpointInfo = async (): Promise<EndpointInfo | null> => {
  if (cachedEndpointInfo) return cachedEndpointInfo;
  const project = getProject();
  const location = getVectorLocation();
  const endpointId = getIndexEndpointId();
  if (!project || !endpointId) return null;

  const token = await getAccessToken();
  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/indexEndpoints/${endpointId}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as Record<string, unknown>;
  const publicEndpointDomain =
    typeof data.publicEndpointDomainName === "string"
      ? data.publicEndpointDomainName
      : typeof data.public_endpoint_domain_name === "string"
        ? data.public_endpoint_domain_name
        : null;
  const deployedIndexes = normalizeDeployedIndexes(
    data.deployedIndexes ?? data.deployed_indexes
  );
  cachedEndpointInfo = { publicEndpointDomain, deployedIndexes };
  return cachedEndpointInfo;
};

const getPublicEndpointDomain = async () => {
  const endpoint = await getEndpointInfo();
  return endpoint?.publicEndpointDomain ?? null;
};

const resolveDeployedIndexId = async () => {
  const configured = getConfiguredDeployedIndexId();
  if (configured) return configured;
  const endpoint = await getEndpointInfo();
  if (!endpoint) return "";

  const configuredIndexId = getConfiguredIndexId();
  if (configuredIndexId) {
    const matched = endpoint.deployedIndexes.find(
      (deployed) => deployed.indexId === configuredIndexId
    );
    if (matched) return matched.id;
  }

  return endpoint.deployedIndexes[0]?.id ?? "";
};

export const upsertVector = async (payload: VectorUpsertPayload) => {
  const project = getProject();
  const location = getVectorLocation();
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
      allowList: [String(value)],
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

export const findNeighbors = async (input: {
  vector: number[];
  neighborCount?: number;
}): Promise<VectorNeighbor[]> => {
  const project = getProject();
  const location = getVectorLocation();
  const endpointId = getIndexEndpointId();
  const deployedIndexId = await resolveDeployedIndexId();

  if (!project) {
    throw new Error("GCP_PROJECT_ID is not set");
  }
  if (!endpointId) {
    throw new Error("VERTEX_VECTOR_ENDPOINT_ID is not set");
  }
  if (!deployedIndexId) {
    throw new Error(
      "VERTEX_VECTOR_DEPLOYED_INDEX_ID is not set and no deployed index was found on endpoint"
    );
  }

  const token = await getAccessToken();
  const publicDomain = await getPublicEndpointDomain();
  const baseUrl = publicDomain
    ? `https://${publicDomain}`
    : `https://${location}-aiplatform.googleapis.com`;

  const url = `${baseUrl}/v1/projects/${project}/locations/${location}/indexEndpoints/${endpointId}:findNeighbors`;
  const camelBody = {
    deployedIndexId: deployedIndexId,
    queries: [
      {
        neighborCount: input.neighborCount ?? 10,
        datapoint: {
          datapointId: "query",
          featureVector: input.vector,
        },
      },
    ],
  };
  const snakeBody = {
    deployed_index_id: deployedIndexId,
    queries: [
      {
        neighbor_count: input.neighborCount ?? 10,
        datapoint: {
          datapoint_id: "query",
          feature_vector: input.vector,
        },
      },
    ],
  };

  let res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(camelBody),
  });

  if (!res.ok && res.status === 400) {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(snakeBody),
    });
  }

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Vector query failed: ${res.status} ${errorText}`);
  }

  const data = (await res.json()) as {
    nearestNeighbors?: Array<{
      neighbors?: Array<{
        distance?: number;
        datapoint?: { datapointId?: string; datapoint_id?: string };
      }>;
    }>;
    nearest_neighbors?: Array<{
      neighbors?: Array<{
        distance?: number;
        datapoint?: { datapointId?: string; datapoint_id?: string };
      }>;
    }>;
  };

  const neighbors =
    data.nearestNeighbors?.[0]?.neighbors ?? data.nearest_neighbors?.[0]?.neighbors ?? [];
  return neighbors
    .map((neighbor) => ({
      id: neighbor.datapoint?.datapointId ?? neighbor.datapoint?.datapoint_id ?? "",
      distance: neighbor.distance ?? 0,
    }))
    .filter((neighbor) => Boolean(neighbor.id));
};
