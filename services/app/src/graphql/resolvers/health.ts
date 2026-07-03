import type { MercuriusContext } from "mercurius";

import { makeResponse } from "../response.js";

export const healthResolvers = {
  Query: {
    health: (_root: unknown, _args: unknown, context: MercuriusContext) => {
      return makeResponse(context.app.loggerAdapter, {
        message: "The server is up and running",
        data: { version: context.app.config.graphqlApiVersionNumber },
      });
    },
  },
};
