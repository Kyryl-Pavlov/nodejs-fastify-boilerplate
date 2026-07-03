import { getPrismaClient } from "@app/prisma.js";
import { describe, expect, vi } from "vitest";

import { test } from "./fixtures.js";

vi.mock("@app/services/awsSqsService.js", () => ({ sendEvent: vi.fn() }));

const { sendEvent } = await import("@app/services/awsSqsService.js");

describe("POST /api/v1/events", () => {
  test("publishes an event and returns 202 with a message id", async ({
    client,
    authHeaders,
  }) => {
    vi.mocked(sendEvent).mockResolvedValue("msg-abc");
    const res = await client.inject({
      method: "POST",
      url: "/api/v1/events",
      headers: authHeaders,
      payload: { type: "user.created", payload: { userId: "1" } },
    });
    expect(res.statusCode).toBe(202);
    expect((res.json() as { data: { message_id: string } }).data.message_id).toBe(
      "msg-abc",
    );
  });

  test("400s when the event type is missing", async ({ client, authHeaders }) => {
    const res = await client.inject({
      method: "POST",
      url: "/api/v1/events",
      headers: authHeaders,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  test("401s without an access token", async ({ client }) => {
    const res = await client.inject({
      method: "POST",
      url: "/api/v1/events",
      payload: { type: "user.created" },
    });
    expect(res.statusCode).toBe(401);
  });

  test("500s when publishing to SQS fails", async ({ client, authHeaders }) => {
    vi.mocked(sendEvent).mockRejectedValueOnce(new Error("SQS unavailable"));
    const res = await client.inject({
      method: "POST",
      url: "/api/v1/events",
      headers: authHeaders,
      payload: { type: "user.created" },
    });
    expect(res.statusCode).toBe(500);
  });

  test("defaults payload to an empty object when omitted", async ({
    client,
    authHeaders,
  }) => {
    vi.mocked(sendEvent).mockResolvedValue("msg-def");
    const res = await client.inject({
      method: "POST",
      url: "/api/v1/events",
      headers: authHeaders,
      payload: { type: "user.created" },
    });
    expect(res.statusCode).toBe(202);
    expect(sendEvent).toHaveBeenCalledWith(expect.anything(), "user.created", {});
  });
});

describe("GET /api/v1/events", () => {
  // Publishing only sends to SQS — a DB row only appears once the Lambda worker
  // consumes the message asynchronously, so "list" tests seed the table directly
  // rather than going through the publish endpoint.
  test("lists previously processed events", async ({ client, authHeaders }) => {
    await getPrismaClient().event.create({
      data: {
        sqsMessageId: "seed-1",
        type: "user.created",
        payload: { a: 1 },
        status: "processed",
      },
    });

    const res = await client.inject({
      method: "GET",
      url: "/api/v1/events",
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      data: Array<{ type: string; sqs_message_id: string }>;
    };
    expect(body.data).toHaveLength(1);
    expect(body.data[0].type).toBe("user.created");
    expect(body.data[0].sqs_message_id).toBe("seed-1");
  });

  test("401s without an access token", async ({ client }) => {
    const res = await client.inject({ method: "GET", url: "/api/v1/events" });
    expect(res.statusCode).toBe(401);
  });

  test("returns an empty list when no events exist", async ({
    client,
    authHeaders,
  }) => {
    const res = await client.inject({
      method: "GET",
      url: "/api/v1/events",
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { data: unknown[] }).data).toEqual([]);
  });
});
