import { createApp } from "./app.js";

const app = await createApp();
const port = Number(process.env.PORT ?? 4000);

try {
  await app.listen({ host: "0.0.0.0", port });
  app.log.info(`Personal Context OS API listening on :${port}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
