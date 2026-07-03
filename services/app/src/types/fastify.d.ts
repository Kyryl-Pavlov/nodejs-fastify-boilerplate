import "fastify";
import type { PrismaClient } from "@prisma/client";

import type { AppConfig } from "../config.js";
import type { AppLogger } from "../logging/logger.js";
import type { CacheService } from "../services/cacheService.js";

declare module "fastify" {
  interface FastifyInstance {
    config: AppConfig;
    loggerAdapter: AppLogger;
    cache: CacheService | null;
    prisma: PrismaClient;
  }

  interface FastifyRequest {
    userId?: string;
    startTime?: bigint;
  }
}
