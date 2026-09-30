import http from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { ensureSchemaOnce, publicDbError } from "./db.js";
import { handleApi } from "./api-core.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Local only. Vercel injects env vars itself; .env is gitignored.
function loadDotEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
loadDotEnv(path.join(__dirname, ".env"));
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
    console.error("Neon schema setup failed:", publicDbError(err));
  }
});
