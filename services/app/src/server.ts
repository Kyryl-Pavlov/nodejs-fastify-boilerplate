import { buildApp } from "./app.js";

const configName = process.env.APP_ENV === "production" ? "production" : "development";

const app = await buildApp(configName);

try {
  await app.listen({ host: "0.0.0.0", port: 5000 });
} catch (err) {
  console.error(err);
  process.exit(1);
}
