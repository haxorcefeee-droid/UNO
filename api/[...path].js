import { runApi, slugParts } from "./_run.js";

// Fallback for any /api/* path that does not have its own file.
// Nested routes such as /api/auth/login also have a dedicated file, because
// a single root catch-all was only receiving one path segment on Vercel.
export default function handler(req, res) {
  const fromUrl = new URL(req.url || "/", "https://localhost").pathname;
  const parts = slugParts(req.query?.path);
  const pathname = fromUrl.startsWith("/api/") && fromUrl !== "/api"
    ? fromUrl
    : "/api/" + parts.join("/");
  return runApi(req, res, pathname);
}
