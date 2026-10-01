import { runApi } from "../_run.js";

export default function handler(req, res) {
  const fromQuery = String(req.query?.action || "");
  const fromPath = new URL(req.url || "/", "https://localhost").pathname.split("/").filter(Boolean);
  const action = (fromQuery || fromPath[fromPath.length - 1] || "").replace(/[^a-z]/gi, "");
  return runApi(req, res, "/api/social/" + action);
}
