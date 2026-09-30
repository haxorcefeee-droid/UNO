// Shared by the Vercel route files. Not a route itself (underscore prefix).
import { handleApi } from "../api-core.js";

export async function runApi(req, res, pathname) {
  const host = req.headers.host || "localhost";
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim() || "https";
  const incoming = new URL(req.url || "/", `${proto}://${host}`);
  const url = new URL(pathname, `${proto}://${host}`);
  incoming.searchParams.forEach((value, key) => url.searchParams.append(key, value));
  const result = await handleApi(req, res, url);
  res.setHeader("Cache-Control", "no-store");
  res.status(result.status).json(result.body);
}

export function slugParts(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value == null || value === "") return [];
  return String(value).split("/").filter(Boolean);
}
