import { buildApp } from "@app/app.js";
import { getPrismaClient } from "@app/prisma.js";
import type { CacheService } from "@app/services/cacheService.js";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { test as base, vi } from "vitest";

interface RegisteredUser {
  email: string;
  password: string;
}

interface MockCache {
  ping: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  ttl: ReturnType<typeof vi.fn>;
}

export type GqlExecute = (
  query: string,
  variables?: object,
  headers?: Record<string, string>,
) => Promise<LightMyRequestResponse>;

interface Fixtures {
  app: FastifyInstance;
  client: FastifyInstance;
  registeredUser: RegisteredUser;
  accessToken: string;
  refreshToken: string;
  authHeaders: { Authorization: string };
  mockCache: MockCache;
  gql: GqlExecute;
  gqlAuthHeaders: {
    access: { Authorization: string };
    refresh: { Authorization: string };
  };
}

// Vitest isolates each spec file's module graph, so this memoizes the app "once per
// file" — rebuilding a Fastify app per file is cheap; the shared Postgres testcontainer
// from globalSetup.ts is the expensive part, and that genuinely is shared across every file.
let sharedApp: FastifyInstance | undefined;

async function getApp(): Promise<FastifyInstance> {
  if (!sharedApp) {
    sharedApp = await buildApp("testing");
    await sharedApp.ready();
  }
  return sharedApp;
}

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern -- required by Vitest's fixture signature
  app: async ({}, use) => {
    const app = await getApp();
    await use(app);
    // Autouse teardown-only cleanup.
    await getPrismaClient().$executeRawUnsafe(
      'TRUNCATE TABLE "users", "media", "events" RESTART IDENTITY CASCADE',
    );
  },

  client: async ({ app }, use) => {
    await use(app); // the Fastify instance itself is the test client, via .inject()
  },

  registeredUser: async ({ client }, use) => {
    const user: RegisteredUser = {
      email: "user@example.com",
      password: "Password123!",
    };
    await client.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: user,
    });
    await use(user);
  },

  accessToken: async ({ client, registeredUser }, use) => {
    const res = await client.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: registeredUser,
    });
    const body = res.json() as { data: { access_token: string } };
    await use(body.data.access_token);
  },

  refreshToken: async ({ client, registeredUser }, use) => {
    const res = await client.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: registeredUser,
    });
    const body = res.json() as { data: { refresh_token: string } };
    await use(body.data.refresh_token);
  },

  authHeaders: async ({ accessToken }, use) => {
    await use({ Authorization: `Bearer ${accessToken}` });
  },

  mockCache: async ({ app }, use) => {
    const mock: MockCache = {
      ping: vi.fn(),
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      ttl: vi.fn(),
    };
    const original = app.cache;
    app.cache = mock as unknown as CacheService;
    await use(mock);
    app.cache = original;
  },

  gql: async ({ client }, use) => {
    const execute: GqlExecute = async (query, variables, headers) => {
      const payload: Record<string, unknown> = { query };
      if (variables) payload.variables = variables;
      return client.inject({
        method: "POST",
        url: "/graphql",
        payload,
        headers: headers ?? {},
      });
    };
    await use(execute);
  },

  gqlAuthHeaders: async ({ client, registeredUser }, use) => {
    const res = await client.inject({
      method: "POST",
      url: "/graphql",
      payload: {
        query: `
          mutation($email: String!, $password: String!) {
            login(email: $email, password: $password) {
              data { accessToken refreshToken }
            }
          }
        `,
        variables: registeredUser,
      },
    });
    const body = res.json() as {
      data: { login: { data: { accessToken: string; refreshToken: string } } };
    };
    const tokens = body.data.login.data;
    await use({
      access: { Authorization: `Bearer ${tokens.accessToken}` },
      refresh: { Authorization: `Bearer ${tokens.refreshToken}` },
    });
  },
});
