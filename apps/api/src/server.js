import http from "node:http";
import { pathToFileURL } from "node:url";

import { createProjectStore } from "./projectStore.js";
import { handleApiRequest } from "./api.js";

function sendJson(res, statusCode, body) {
  const data = JSON.stringify(body);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(data)
  });
  res.end(data);
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, { "content-type": "text/plain; charset=utf-8" });
  res.end(text);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return null;
  return JSON.parse(raw);
}

function withCors(req, res) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type");
  res.setHeader("access-control-allow-methods", "GET,POST,PUT,DELETE,OPTIONS");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }
  return false;
}

export function createApiServer({ store }) {
  return http.createServer(async (req, res) => {
    try {
      if (withCors(req, res)) return;

      let body = null;
      try {
        body = await readJson(req);
      } catch {
        return sendJson(res, 400, { error: "Invalid JSON" });
      }

      const result = await handleApiRequest({
        store,
        method: req.method ?? "GET",
        url: req.url ?? "/",
        body
      });

      if (result.json !== undefined) return sendJson(res, result.status, result.json);
      return sendText(res, result.status, result.text ?? "");
    } catch (error) {
      return sendJson(res, 500, { error: String(error?.message ?? error) });
    }
  });
}

export async function main() {
  const store = await createProjectStore({
    filename: process.env.DATA_FILE,
    databaseUrl: process.env.DATABASE_URL
  });

  const server = createApiServer({ store });
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "127.0.0.1";
  server.listen(port, host, () => {
    // eslint-disable-next-line no-console
    console.log(`API listening on http://${host}:${port}`);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
