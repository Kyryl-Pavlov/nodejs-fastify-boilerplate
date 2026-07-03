import type { FastifyInstance } from "fastify";

import { restApiResponse } from "../../api/utils/response.js";

const CACHE_KEY = "poc:test_value";
const CACHE_TTL = 60;

interface CachedValue {
  computed_at: number;
  payload: string;
}

export async function cacheTestRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/cache/ping", async (_request, reply) => {
    const cache = fastify.cache;
    if (!cache) {
      return restApiResponse(reply, {
        success: false,
        message: "Redis not configured",
        statusCode: 503,
      });
    }
    return restApiResponse(reply, {
      data: { redis: (await cache.ping()) ? "ok" : "unavailable" },
    });
  });

  fastify.get("/cache/test", async (_request, reply) => {
    const cache = fastify.cache;
    if (!cache) {
      return restApiResponse(reply, {
        success: false,
        message: "Redis not configured",
        statusCode: 503,
      });
    }

    const cached = await cache.get<CachedValue>(CACHE_KEY);
    if (cached !== null) {
      return restApiResponse(reply, {
        message: "Cache hit",
        data: { ...cached, source: "cache", remaining_ttl: await cache.ttl(CACHE_KEY) },
      });
    }

    const value: CachedValue = {
      computed_at: Date.now() / 1000,
      payload: "Simulated expensive computation result",
    };
    await cache.set(CACHE_KEY, value, CACHE_TTL);
    return restApiResponse(reply, {
      message: "Cache miss — value computed and stored",
      data: { ...value, source: "computed", ttl: CACHE_TTL },
    });
  });

  fastify.delete("/cache/test", async (_request, reply) => {
    const cache = fastify.cache;
    if (!cache) {
      return restApiResponse(reply, {
        success: false,
        message: "Redis not configured",
        statusCode: 503,
      });
    }

    const deleted = await cache.delete(CACHE_KEY);
    return restApiResponse(reply, {
      message: deleted ? "Cache key deleted" : "Key was not in cache",
      data: { deleted },
    });
  });
}
