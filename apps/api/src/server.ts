import { createApp } from "./app.js";

const app = await createApp();

try {
  await app.listen({ host: "0.0.0.0", port: 4000 });
  app.log.info("Personal Context OS API listening on :4000");
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
