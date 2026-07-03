import type { FastifyRequest } from "fastify";

// mercurius-upload and @fastify/multipart both register a global content-type parser
// for multipart/form-data via fastify-plugin, which collide when both are registered
// on the same Fastify instance (FST_ERR_CTP_ALREADY_PRESENT). Since REST media upload
// already needs @fastify/multipart, GraphQL file uploads are handled by hand-rolling
// the jaydenseric graphql-multipart-request-spec (operations/map/file parts) on top of
// the same @fastify/multipart parser instead of pulling in a second one.

export interface ResolvedUpload {
  filename: string;
  content: Buffer;
}

function setByPath(
  target: Record<string, unknown>,
  path: string[],
  value: unknown,
): void {
  let node: Record<string, unknown> = target;
  for (let i = 0; i < path.length - 1; i++) {
    const next = node[path[i]];
    if (typeof next !== "object" || next === null) return;
    node = next as Record<string, unknown>;
  }
  node[path[path.length - 1]] = value;
}

export const GRAPHQL_PATH = "/graphql";

export function isGraphqlMultipartRequest(request: FastifyRequest): boolean {
  const contentType = request.headers["content-type"] ?? "";
  return (
    request.url.startsWith(GRAPHQL_PATH) &&
    contentType.startsWith("multipart/form-data")
  );
}

/** Parses a GraphQL multipart request into a normal { query, variables } body,
 * replacing each file placeholder in `variables` with a ResolvedUpload. */
export async function parseGraphqlMultipart(request: FastifyRequest): Promise<unknown> {
  let operations: { query?: string; variables?: Record<string, unknown> } = {};
  let fileMap: Record<string, string[]> = {};
  const files: Record<string, ResolvedUpload> = {};

  for await (const part of request.parts()) {
    if (part.type === "file") {
      files[part.fieldname] = {
        filename: part.filename,
        content: await part.toBuffer(),
      };
      continue;
    }
    if (part.fieldname === "operations") {
      operations = JSON.parse(String(part.value)) as typeof operations;
    } else if (part.fieldname === "map") {
      fileMap = JSON.parse(String(part.value)) as typeof fileMap;
    }
  }

  operations.variables ??= {};
  for (const [fileKey, paths] of Object.entries(fileMap)) {
    const resolved = files[fileKey];
    if (!resolved) continue;
    // Each path is like "variables.file" — navigate from `operations` itself, not
    // from `operations.variables`, since the path already includes that segment.
    for (const path of paths) {
      setByPath(operations as Record<string, unknown>, path.split("."), resolved);
    }
  }

  return { query: operations.query, variables: operations.variables };
}
