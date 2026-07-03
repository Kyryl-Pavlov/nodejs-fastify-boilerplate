import type { FastifyInstance } from "fastify";

// Deliberately bypasses restApiResponse()'s {success,message,data} envelope —
// an existing inconsistency, preserved on purpose.
export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/health", async (_request, reply) => {
    return reply.send({ status: "ok", version: fastify.config.restApiVersionNumber });
  });
}
