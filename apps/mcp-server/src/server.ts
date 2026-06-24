import { createMcpApp } from "./app.js";

const app = await createMcpApp();
const port = Number(process.env.PORT ?? 4100);

try {
  await app.listen({ host: "0.0.0.0", port });
  app.log.info(`Personal Context OS MCP server listening on :${port}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
