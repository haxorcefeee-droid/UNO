// Vercel serverless catch-all for /api and /api/*.
// A file named index.js only receives /api, so routes such as /api/scores
// never reached the handler when a rewrite collapsed them.
import { handleApi } from "../api-core.js";

export default async function handler(req, res) {
  const url = new URL(req.url || "/", `https://${req.headers.host || "localhost"}`);
  const result = await handleApi(req, res, url);
  res.status(result.status).json(result.body);
}
