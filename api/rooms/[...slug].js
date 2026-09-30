import { runApi, slugParts } from "../_run.js";

export default function handler(req, res) {
  let parts = slugParts(req.query?.slug);
  if (!parts.length) {
    const bits = new URL(req.url || "/", "https://localhost").pathname.split("/").filter(Boolean);
    const at = bits.indexOf("rooms");
    parts = at >= 0 ? bits.slice(at + 1) : [];
  }
  return runApi(req, res, "/api/rooms/" + parts.join("/"));
}
