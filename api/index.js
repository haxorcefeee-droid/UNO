// Vercel serverless entry: one catch-all function for every /api route.
import { ensureSchemaOnce } from "../db.js";
import { handleApi } from "../api-core.js";

export default async function handler(req, res) {
  // set up the schema lazily on first request per instance
  try {
    await ensureSchemaOnce();
  } catch (err) {
    res.status(500).json({
      error: "Database not configured. Set DATABASE_URL (Neon connection string) in Vercel → Settings → Environment Variables.",
    });
    return;
  }

  const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
  const result = await handleApi(req, res, url);
  res.status(result.status).json(result.body);
}
