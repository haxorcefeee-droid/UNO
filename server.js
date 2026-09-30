import http from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { ensureSchemaOnce } from "./db.js";
import { handleApi } from "./api-core.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
};

async function sendFile(res, file) {
  const { readFile } = await import("node:fs/promises");
  const data = await readFile(file);
  res.writeHead(200, {
    "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
    "Cache-Control": "no-cache",
  });
  res.end(data);
}

function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const file = path.normalize(path.join(__dirname, pathname));
  if (!file.startsWith(__dirname)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  sendFile(res, file).catch(() => {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url.pathname.startsWith("/api/")) {
    try {
      const result = await handleApi(req, res, url);
      res.writeHead(result.status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(result.body));
    } catch (err) {
      console.error("Unhandled API error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
    return;
  }

  return serveStatic(req, res, url);
});

server.listen(PORT, HOST, async () => {
  console.log(`UNO server running at http://localhost:${PORT}`);
  try {
    await ensureSchemaOnce();
    console.log("Neon database schema ready");
  } catch (err) {
    console.error("Neon schema setup failed:", err.message);
    console.error("Set DATABASE_URL (Neon connection string) and restart.");
  }
});
