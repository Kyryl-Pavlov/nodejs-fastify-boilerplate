import type { FastifyInstance } from "fastify";

import { restApiResponse } from "../../api/utils/response.js";
import {
  requireRefreshToken,
  signAccessToken,
  signRefreshToken,
} from "../../lib/auth.js";
import { checkPassword, hashPassword } from "../../lib/password.js";

interface AuthBody {
  email?: string;
  password?: string;
}

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: AuthBody }>("/register", async (request, reply) => {
    const email = (request.body?.email ?? "").trim().toLowerCase();
    const password = request.body?.password ?? "";

    if (!email || !password) {
      return restApiResponse(reply, {
        success: false,
        message: "Email and password are required",
        statusCode: 400,
      });
    }

    const existing = await fastify.prisma.user.findUnique({ where: { email } });
    if (existing) {
      return restApiResponse(reply, {
        success: false,
        message: "Email already registered",
        statusCode: 409,
      });
    }

    try {
      const passwordHash = await hashPassword(password);
      await fastify.prisma.user.create({ data: { email, passwordHash } });
    } catch (err) {
      return restApiResponse(reply, {
        success: false,
        message: "Registration failed",
        statusCode: 500,
        exc: err,
      });
    }

    return restApiResponse(reply, { statusCode: 201 });
  });

  fastify.post<{ Body: AuthBody }>("/login", async (request, reply) => {
    const email = (request.body?.email ?? "").trim().toLowerCase();
    const password = request.body?.password ?? "";

    if (!email || !password) {
      return restApiResponse(reply, {
        success: false,
        message: "Email and password are required",
        statusCode: 400,
      });
    }

    try {
      const user = await fastify.prisma.user.findUnique({ where: { email } });
      if (!user || !(await checkPassword(password, user.passwordHash))) {
        return restApiResponse(reply, {
          success: false,
          message: "Invalid credentials",
          statusCode: 401,
        });
      }

      return restApiResponse(reply, {
        data: {
          access_token: signAccessToken(fastify, user.id),
          refresh_token: signRefreshToken(fastify, user.id),
        },
      });
    } catch (err) {
      return restApiResponse(reply, {
        success: false,
        message: "Login failed",
        statusCode: 500,
        exc: err,
      });
    }
  });

  fastify.post(
    "/refresh",
    { preHandler: requireRefreshToken },
    async (request, reply) => {
      if (!request.userId) return; // preHandler already sent a 401

      try {
        return restApiResponse(reply, {
          data: { access_token: signAccessToken(fastify, request.userId) },
        });
      } catch (err) {
        return restApiResponse(reply, {
          success: false,
          message: "Token refresh failed",
          statusCode: 500,
          exc: err,
        });
      }
    },
  );
}
