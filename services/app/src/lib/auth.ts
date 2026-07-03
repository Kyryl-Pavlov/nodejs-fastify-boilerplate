import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

export interface JwtPayload {
  sub: string;
  type: "access" | "refresh";
}

export class UnauthorizedError extends Error {}

export function signAccessToken(fastify: FastifyInstance, userId: string): string {
  return fastify.jwt.sign({ sub: userId, type: "access" } satisfies JwtPayload, {
    expiresIn: fastify.config.jwtAccessTokenExpiresIn,
  });
}

export function signRefreshToken(fastify: FastifyInstance, userId: string): string {
  return fastify.jwt.sign({ sub: userId, type: "refresh" } satisfies JwtPayload, {
    expiresIn: fastify.config.jwtRefreshTokenExpiresIn,
  });
}

/** Verifies an access token and returns the user id. Throws UnauthorizedError otherwise. */
export async function verifyAccessToken(request: FastifyRequest): Promise<string> {
  let payload: JwtPayload;
  try {
    payload = await request.jwtVerify<JwtPayload>();
  } catch (err) {
    throw new UnauthorizedError(err instanceof Error ? err.message : "Invalid token");
  }
  if (payload.type !== "access") throw new UnauthorizedError("Invalid token type");
  return payload.sub;
}

/** Verifies a refresh token and returns the user id. Throws UnauthorizedError otherwise. */
export async function verifyRefreshToken(request: FastifyRequest): Promise<string> {
  let payload: JwtPayload;
  try {
    payload = await request.jwtVerify<JwtPayload>();
  } catch (err) {
    throw new UnauthorizedError(err instanceof Error ? err.message : "Invalid token");
  }
  if (payload.type !== "refresh") throw new UnauthorizedError("Invalid token type");
  return payload.sub;
}

/** REST preHandler — replies 401 directly, not via restApiResponse. */
export async function requireAccessToken(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    request.userId = await verifyAccessToken(request);
  } catch {
    await reply.code(401).send({ msg: "Missing or invalid access token" });
  }
}

/** REST preHandler — same as requireAccessToken but for refresh tokens. */
export async function requireRefreshToken(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    request.userId = await verifyRefreshToken(request);
  } catch {
    await reply.code(401).send({ msg: "Missing or invalid refresh token" });
  }
}
