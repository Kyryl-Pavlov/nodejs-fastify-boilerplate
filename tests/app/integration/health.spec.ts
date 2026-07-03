import { expect } from "vitest";

import { test } from "./fixtures.js";

test("GET /api/v1/health returns ok with a version", async ({ client }) => {
  const res = await client.inject({ method: "GET", url: "/api/v1/health" });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ status: "ok", version: expect.any(String) });
});
