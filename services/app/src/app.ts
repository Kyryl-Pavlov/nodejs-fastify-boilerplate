import fastifyJwt from "@fastify/jwt";
import fastifyMultipart from "@fastify/multipart";
import Fastify, { type FastifyInstance } from "fastify";
import { NoSchemaIntrospectionCustomRule } from "graphql";
import mercurius from "mercurius";
import promClient from "prom-client";

import { type ConfigName, loadConfig } from "./config.js";
import { buildContext } from "./graphql/context.js";
import {
  isGraphqlMultipartRequest,
  parseGraphqlMultipart,
} from "./graphql/multipartUpload.js";
import { resolvers } from "./graphql/resolvers/index.js";
import { typeDefs } from "./graphql/schema.js";
import { CloudWatchLogger } from "./logging/cloudwatchLogger.js";
import {
  AppLogger,
  ConsoleLogger,
  type LoggerBackend,
  LogLevel,
} from "./logging/logger.js";
import { LokiLogger } from "./logging/lokiLogger.js";
import { SentryLogger } from "./logging/sentryLogger.js";
import { getPrismaClient } from "./prisma.js";
import { registerV1Routes } from "./routes/v1/index.js";
import { CacheService } from "./services/cacheService.js";

const APP_LABEL = "nodejs-fastify-boilerplate";

promClient.register.setDefaultLabels({ app: APP_LABEL });
const httpRequestDuration = new promClient.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"],
  registers: [promClient.register],
});

export async function buildApp(configName: ConfigName): Promise<FastifyInstance> {
  const config = loadConfig(configName);

  const fastify = Fastify({
    logger: false, // request/response logging goes through AppLogger, not Fastify's own logger
    bodyLimit: config.maxContentLength,
  });

  fastify.decorate("config", config);
  fastify.decorate("prisma", getPrismaClient());

  const loggers: LoggerBackend[] = [new ConsoleLogger(config.debug)];

  if (config.sentryDsn) {
    loggers.push(new SentryLogger({ dsn: config.sentryDsn, environment: configName }));
  }

  if (config.cloudwatchLogGroup) {
    try {
      loggers.push(
        new CloudWatchLogger({
          logGroup: config.cloudwatchLogGroup,
          streamName: config.cloudwatchStreamName,
          region: config.aws.defaultRegion,
          accessKeyId: config.aws.accessKeyId,
          secretAccessKey: config.aws.secretAccessKey,
          endpointUrl: config.cloudwatchEndpointUrl,
        }),
      );
    } catch (err) {
      // loggerAdapter doesn't exist yet at this point in bootstrap, so fall back to console.
      console.warn(`CloudWatch logger unavailable, skipping: ${String(err)}`);
    }
  }

  if (config.lokiUrl) {
    loggers.push(new LokiLogger(config.lokiUrl, { app: APP_LABEL, env: configName }));
  }

  fastify.decorate("loggerAdapter", new AppLogger(...loggers));
  fastify.decorate(
    "cache",
    config.redisUrl ? CacheService.fromUrl(config.redisUrl) : null,
  );

  await fastify.register(fastifyJwt, { secret: config.jwtSecretKey });
  await fastify.register(fastifyMultipart);

  fastify.get("/metrics", async (_request, reply) => {
    reply.header("Content-Type", promClient.register.contentType);
    return promClient.register.metrics();
  });

  await registerV1Routes(fastify, { prefix: `/api/${config.restApiVersion}` });

  // Rewrites GraphQL multipart requests (file uploads) into a normal {query,
  // variables} body before Mercurius parses it — see multipartUpload.ts for why this
  // replaces mercurius-upload instead of registering it alongside @fastify/multipart.
  fastify.addHook("preValidation", async (request) => {
    if (isGraphqlMultipartRequest(request)) {
      request.body = await parseGraphqlMultipart(request);
    }
  });

  await fastify.register(mercurius, {
    schema: typeDefs,
    resolvers,
    context: buildContext,
    path: "/graphql",
    graphiql: config.graphqlIntrospection,
    validationRules: config.graphqlIntrospection
      ? []
      : [NoSchemaIntrospectionCustomRule],
  });

  fastify.addHook("onRequest", async (request) => {
    request.startTime = process.hrtime.bigint();
  });

  fastify.addHook("onResponse", async (request, reply) => {
    const start = request.startTime;
    const durationMs = start ? Number(process.hrtime.bigint() - start) / 1_000_000 : 0;
    const route = request.routeOptions?.url ?? request.url;

    httpRequestDuration.observe(
      { method: request.method, route, status_code: reply.statusCode },
      durationMs / 1000,
    );

    fastify.loggerAdapter.log("response", {
      level: LogLevel.INFO,
      data: {
        method: request.method,
        path: request.url,
        status: reply.statusCode,
        duration_ms: Math.round(durationMs * 100) / 100,
      },
    });
  });

  return fastify;
}
