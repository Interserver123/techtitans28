import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { env } from "./env";

declare global {
  var __ttPool: Pool | undefined;
}

export function pool(): Pool {
  if (!globalThis.__ttPool) {
    const e = env();
    globalThis.__ttPool = new Pool({
      connectionString: e.DATABASE_URL.replace(/[?&]sslmode=[^&]*/g, ""),
      max: e.DATABASE_POOL_MAX,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000,
      statement_timeout: 15_000,
      application_name: "techtitans28-portal",
      ssl:
        e.DATABASE_SSL === "disable"
          ? undefined
          : e.DATABASE_SSL === "verify"
            ? { rejectUnauthorized: true, ca: e.DATABASE_CA_CERT }
            : { rejectUnauthorized: false },
    });
    globalThis.__ttPool.on("error", () => {
      /* idle client errors are recovered by the pool; never crash the process */
    });
  }
  return globalThis.__ttPool;
}

export type Queryable = Pick<PoolClient, "query">;

export async function query<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = [], client?: Queryable) {
  const res = await (client ?? pool()).query<T>(sql, params as never[]);
  return res.rows;
}

export async function one<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = [], client?: Queryable) {
  const rows = await query<T>(sql, params, client);
  return rows[0] ?? null;
}

/** Runs fn inside a transaction; rolls back on any error. */
export async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("begin");
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (globalThis.__ttPool) {
    await globalThis.__ttPool.end();
    globalThis.__ttPool = undefined;
  }
}
