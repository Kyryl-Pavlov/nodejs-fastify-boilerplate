import type { FastifyReply, FastifyRequest } from "fastify";

// Mercurius's default context already provides `app` and `reply` — this just adds
// `request`, which isn't included by default, via declaration merging.
declare module "mercurius" {
  interface MercuriusContext {
    request: FastifyRequest;
  }
}

export function buildContext(
  request: FastifyRequest,
  _reply: FastifyReply,
): { request: FastifyRequest } {
  return { request };
}
