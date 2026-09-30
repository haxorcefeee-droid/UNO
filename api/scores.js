import { runApi } from "./_run.js";

export default function handler(req, res) {
  return runApi(req, res, "/api/scores");
}
