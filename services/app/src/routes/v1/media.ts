import type { FastifyInstance } from "fastify";

import { restApiResponse } from "../../api/utils/response.js";
import { requireAccessToken } from "../../lib/auth.js";
import { isValidUuid } from "../../lib/uuid.js";
import { getPresignedUrl, uploadFile } from "../../services/awsS3Service.js";

const ALLOWED_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "pdf",
  "mp4",
  "mov",
]);

function isAllowedFile(filename: string): boolean {
  const idx = filename.lastIndexOf(".");
  if (idx === -1) return false;
  return ALLOWED_EXTENSIONS.has(filename.slice(idx + 1).toLowerCase());
}

export async function mediaRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    "/upload",
    { preHandler: requireAccessToken },
    async (request, reply) => {
      if (!request.userId) return;

      const file = await request.file().catch(() => undefined);
      if (!file) {
        return restApiResponse(reply, {
          success: false,
          message: "No file provided",
          statusCode: 400,
        });
      }
      if (!file.filename) {
        return restApiResponse(reply, {
          success: false,
          message: "Empty filename",
          statusCode: 400,
        });
      }
      if (!isAllowedFile(file.filename)) {
        const allowed = [...ALLOWED_EXTENSIONS].sort().join(", ");
        return restApiResponse(reply, {
          success: false,
          message: `File type not allowed. Permitted: ${allowed}`,
          statusCode: 415,
        });
      }

      let s3Key: string;
      try {
        s3Key = await uploadFile(
          fastify.config.aws,
          file.file,
          request.userId,
          file.filename,
        );
      } catch (err) {
        return restApiResponse(reply, {
          success: false,
          message: "File upload failed",
          statusCode: 500,
          exc: err,
        });
      }

      let record;
      try {
        record = await fastify.prisma.media.create({
          data: { userId: request.userId, contentKey: s3Key },
        });
      } catch (err) {
        return restApiResponse(reply, {
          success: false,
          message: "Failed to save file record",
          statusCode: 500,
          exc: err,
        });
      }

      let signedUrl: string;
      try {
        signedUrl = await getPresignedUrl(fastify.config.aws, s3Key);
      } catch (err) {
        return restApiResponse(reply, {
          success: false,
          message: "Failed to generate URL",
          statusCode: 500,
          exc: err,
        });
      }

      // expires_in is hardcoded to 3600 here (not PRESIGNED_URL_EXPIRY) — an intentional
      // REST/GraphQL inconsistency; GraphQL's uploadFile does use the configured value.
      return restApiResponse(reply, {
        data: { media_id: record.id, url: signedUrl, expires_in: 3600 },
        statusCode: 201,
      });
    },
  );

  fastify.get<{ Params: { mediaId: string } }>(
    "/:mediaId/url",
    { preHandler: requireAccessToken },
    async (request, reply) => {
      if (!request.userId) return;
      const { mediaId } = request.params;

      if (!isValidUuid(mediaId)) {
        return restApiResponse(reply, {
          success: false,
          message: "Invalid media ID",
          statusCode: 400,
        });
      }

      const record = await fastify.prisma.media.findUnique({ where: { id: mediaId } });
      if (!record || record.userId !== request.userId) {
        return restApiResponse(reply, {
          success: false,
          message: "Not found",
          statusCode: 404,
        });
      }

      try {
        const url = await getPresignedUrl(fastify.config.aws, record.contentKey);
        return restApiResponse(reply, { data: { url } });
      } catch (err) {
        return restApiResponse(reply, {
          success: false,
          message: "Failed to generate URL",
          statusCode: 500,
          exc: err,
        });
      }
    },
  );
}
