// Postgres access for the fare tracker. Lazy so the planner keeps working
// with no database at all: callers check dbConfigured() and degrade.
//
// Expects a Neon (or any Postgres) pooled connection string in DATABASE_URL.
// Serverless-shaped: one connection per warm instance, TLS on.

let poolPromise = null;

export function dbConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

async function getPool() {
  if (!dbConfigured()) throw new Error('DATABASE_URL is not set');
  if (!poolPromise) {
    poolPromise = import('pg').then(({ default: pg }) => {
      const connectionString = process.env.DATABASE_URL;
      return new pg.Pool({
        connectionString,
        max: 1,
        ssl: /sslmode=disable/.test(connectionString) ? false : { rejectUnauthorized: false },
      });
    });
  }
  return poolPromise;
}

export async function query(text, params = []) {
  const pool = await getPool();
  return pool.query(text, params);
}
