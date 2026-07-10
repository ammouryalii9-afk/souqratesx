import app from "./app";
import { logger } from "./lib/logger";
import { getSettingsMap } from "./lib/settings";
import { syncProvidersFromSettings } from "./providers/manager";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function bootstrapProviders(): Promise<void> {
  try {
    const settings = await getSettingsMap();
    await syncProvidersFromSettings(settings);
  } catch (err) {
    logger.error({ err }, "Failed to bootstrap earning providers");
  }
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  await bootstrapProviders();
  logger.info({ port }, "Server listening");
});
