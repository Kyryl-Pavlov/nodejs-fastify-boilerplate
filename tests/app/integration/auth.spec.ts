import { describe, expect } from "vitest";

import { test } from "./fixtures.js";

describe("POST /api/v1/auth/register", () => {
  test("registers a new user and returns 201", async ({ client }) => {
    const res = await client.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email: "new@example.com", password: "Password123!" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ success: true, message: "", data: {} });
  });

  test("400s when email is missing", async ({ client }) => {
    const res = await client.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { password: "Password123!" },
    });
    expect(res.statusCode).toBe(400);
  });

  test("400s when password is missing", async ({ client }) => {
    const res = await client.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email: "new@example.com" },
    });
    expect(res.statusCode).toBe(400);
  });

  test("409s when the email is already registered", async ({
    client,
    registeredUser,
  }) => {
    const res = await client.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: registeredUser,
    });
    expect(res.statusCode).toBe(409);
  });

  test("lowercases the email before storing it", async ({ client }) => {
    await client.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email: "MiXedCase@Example.com", password: "Password123!" },
    });
    const login = await client.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "mixedcase@example.com", password: "Password123!" },
    });
    expect(login.statusCode).toBe(200);
  });

  test("trims whitespace around the email", async ({ client }) => {
    await client.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email: "  spaced@example.com  ", password: "Password123!" },
    });
    const login = await client.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "spaced@example.com", password: "Password123!" },
    });
    expect(login.statusCode).toBe(200);
  });
});

describe("POST /api/v1/auth/login", () => {
  test("logs in with valid credentials and returns both tokens", async ({
    client,
    registeredUser,
  }) => {
    const res = await client.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: registeredUser,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      data: { access_token: string; refresh_token: string };
    };
    expect(body.data.access_token).toEqual(expect.any(String));
    expect(body.data.refresh_token).toEqual(expect.any(String));
  });

  test("400s when email and password are missing", async ({ client }) => {
    const res = await client.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  test("401s on wrong password", async ({ client, registeredUser }) => {
    const res = await client.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: registeredUser.email, password: "wrong-password" },
    });
    expect(res.statusCode).toBe(401);
  });

  test("401s for a user that doesn't exist", async ({ client }) => {
    const res = await client.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "nobody@example.com", password: "whatever" },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("POST /api/v1/auth/refresh", () => {
  test("issues a new access token given a valid refresh token", async ({
    client,
    refreshToken,
  }) => {
    const res = await client.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: { Authorization: `Bearer ${refreshToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { access_token: string } };
    expect(body.data.access_token).toEqual(expect.any(String));
  });

  test("401s with no Authorization header", async ({ client }) => {
    const res = await client.inject({ method: "POST", url: "/api/v1/auth/refresh" });
    expect(res.statusCode).toBe(401);
  });

  test("401s when given an access token instead of a refresh token", async ({
    client,
    accessToken,
  }) => {
    const res = await client.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(401);
  });
});
