import type { FastifyInstance } from "fastify";

import { authRoutes } from "./auth.js";
import { cacheTestRoutes } from "./cacheTest.js";
import { eventsRoutes } from "./events.js";
import { healthRoutes } from "./health.js";
import { mediaRoutes } from "./media.js";

export async function registerV1Routes(
  fastify: FastifyInstance,
  opts: { prefix: string },
): Promise<void> {
  await fastify.register(
    async (v1) => {
      await v1.register(healthRoutes);
      await v1.register(authRoutes, { prefix: "/auth" });
      await v1.register(mediaRoutes, { prefix: "/media" });
      await v1.register(cacheTestRoutes);
      await v1.register(eventsRoutes, { prefix: "/events" });
    },
    { prefix: opts.prefix },
  );
}
