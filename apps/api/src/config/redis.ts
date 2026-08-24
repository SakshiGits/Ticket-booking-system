import IORedis from "ioredis";
import { env } from "./env";

// Shared connection options for BullMQ (queues + workers) and Socket.IO's Redis adapter.
// BullMQ requires maxRetriesPerRequest: null on the connection it manages.
export const redisConnection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

// A second, general-purpose client for plain pub/sub or cache use outside BullMQ.
export const redisClient = new IORedis(env.REDIS_URL);
