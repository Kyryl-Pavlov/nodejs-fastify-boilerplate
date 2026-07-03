import type { FastifyReply } from "fastify";

import { LogLevel } from "../../logging/logger.js";

export type RestData = Record<string, unknown> | unknown[] | null;

export interface RestApiResponseOptions {
  success?: boolean;
  message?: string;
  data?: RestData;
  statusCode?: number;
  exc?: unknown;
}

function hasContent(data: RestData): data is NonNullable<RestData> {
  if (data === null || data === undefined) return false;
  return Array.isArray(data) ? data.length > 0 : Object.keys(data).length > 0;
}

export function restApiResponse(
  reply: FastifyReply,
  options: RestApiResponseOptions = {},
): FastifyReply {
  const {
    success = true,
    message = "",
    data = null,
    statusCode = 200,
    exc = null,
  } = options;
  const body: NonNullable<RestData> = data ?? {};

  const fastify = reply.server;
  if (fastify.loggerAdapter) {
    const level = success
      ? LogLevel.INFO
      : statusCode >= 500
        ? LogLevel.ERROR
        : LogLevel.WARN;
    // Empty object/array data is treated as absent so the logger only sees actual content.
    fastify.loggerAdapter.log(message, {
      level,
      data: hasContent(data) ? (data as Record<string, unknown>) : null,
      exc,
    });
  }

  return reply.code(statusCode).send({ success, message, data: body });
}
