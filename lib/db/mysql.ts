import mysql from "mysql2/promise";

let pool: mysql.Pool | undefined;

const parseDatabaseUrl = (url: string) => {
  const parsed = new URL(url);
  const database = parsed.pathname.replace(/^\//, "");
  const safeDecode = (value: string) => {
    try {
      return decodeURIComponent(value);
    } catch {
      // Handles unescaped "%" in credentials.
      return value;
    }
  };
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: safeDecode(parsed.username),
    password: safeDecode(parsed.password),
    database,
  };
};

const buildPool = () => {
  const connectionString = process.env.DATABASE_URL;
  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME;
  const sslEnabled = process.env.DB_SSL === "true";

  if (!connectionString && (!host || !user || !database)) {
    throw new Error("Database configuration is missing");
  }

  const baseConfig = connectionString
    ? parseDatabaseUrl(connectionString)
    : { host, port, user, password, database };

  return mysql.createPool({
    ...baseConfig,
    waitForConnections: true,
    connectionLimit: 10,
    ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
  });
};

export const isDbConfigured = () => {
  if (process.env.DATABASE_URL) {
    return true;
  }
  return Boolean(process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME);
};

export const getPool = () => {
  if (!pool) {
    pool = buildPool();
  }
  return pool;
};

export const query = async <T>(sql: string, params?: unknown[]) => {
  const activePool = getPool();
  const [rows] = await activePool.query(sql, params);
  return rows as T[];
};
