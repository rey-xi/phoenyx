import { Redis } from "@upstash/redis";

const url = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_TOKEN;

if (!url || !token) {
  throw new Error("Missing Upstash Redis environment variables.");
}

export const redis = new Redis({ url, token });
