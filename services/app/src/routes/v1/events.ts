import type { FastifyInstance } from "fastify";

import { restApiResponse } from "../../api/utils/response.js";
import { requireAccessToken } from "../../lib/auth.js";
import { sendEvent } from "../../services/awsSqsService.js";

interface PublishEventBody {
  type?: string;
  payload?: unknown;
}

export async function eventsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: PublishEventBody }>(
    "/",
    { preHandler: requireAccessToken },
    async (request, reply) => {
      if (!request.userId) return;

      const eventType = (request.body?.type ?? "").trim();
      const payload = request.body?.payload ?? {};

      if (!eventType) {
        return restApiResponse(reply, {
          success: false,
          message: "Event type is required",
          statusCode: 400,
        });
      }

      let messageId: string;
      try {
        messageId = await sendEvent(fastify.config.aws, eventType, payload);
      } catch (err) {
        return restApiResponse(reply, {
          success: false,
          message: "Failed to publish event",
          statusCode: 500,
          exc: err,
        });
      }

      return restApiResponse(reply, {
        data: { message_id: messageId },
        statusCode: 202,
      });
    },
  );

  fastify.get("/", { preHandler: requireAccessToken }, async (_request, reply) => {
    let rows;
    try {
      rows = await fastify.prisma.event.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
      });
    } catch (err) {
      return restApiResponse(reply, {
        success: false,
        message: "Failed to fetch events",
        statusCode: 500,
        exc: err,
      });
    }

    return restApiResponse(reply, {
      data: rows.map((r) => ({
        id: r.id,
        sqs_message_id: r.sqsMessageId,
        type: r.type,
        payload: r.payload,
        status: r.status,
        created_at: r.createdAt.toISOString(),
        processed_at: r.processedAt ? r.processedAt.toISOString() : null,
      })),
    });
  });
}
