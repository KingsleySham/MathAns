// Shared Redis client for the prefect duty status endpoint.
//
// Uses the plain `redis` package (a TCP connection) against REDIS_URL, not
// @vercel/kv — this project's Storage is a generic Redis database (e.g. Redis
// Cloud via the Vercel Marketplace), not the REST-based Vercel KV/Upstash
// integration. Set REDIS_URL in Vercel's project env vars; never commit it.
//
// Serverless functions can reuse the module scope across warm invocations, so
// the client is created once and the connect() promise is cached — a cold
// start pays for one connection, a warm one reuses it. node-redis queues
// commands issued before connect() resolves, so callers don't have to await
// getRedisClient() before calling client methods, but awaiting it here keeps
// errors from a failed connection surfacing at the call site instead of
// inside a queued command.

import { createClient } from 'redis';

let clientPromise = null;

export function getRedisClient() {
  if (!clientPromise) {
    const client = createClient({ url: process.env.REDIS_URL });
    client.on('error', (err) => console.error('Redis client error', err));
    clientPromise = client.connect().then(() => client).catch((err) => {
      clientPromise = null; // let the next call retry instead of caching a dead connection
      throw err;
    });
  }
  return clientPromise;
}
