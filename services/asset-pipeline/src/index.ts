import express from "express";
import { ensureStorageRoot, getStorageRoot } from "./lib/storage";
import { jobsRouter } from "./routes/jobs";
import { renderHomePage } from "./ui/homePage";

async function start(): Promise<void> {
  await ensureStorageRoot();

  const app = express();
  app.use(express.json());

  app.get("/", (_req, res) => {
    res.type("html").send(renderHomePage());
  });

  app.get("/favicon.ico", (_req, res) => {
    res.status(204).end();
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true, storageRoot: getStorageRoot() });
  });

  app.use(jobsRouter);

  const port = Number(process.env.PORT || 3100);
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`asset-pipeline listening on :${port}`);
  });
}

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start asset-pipeline", error);
  process.exit(1);
});
