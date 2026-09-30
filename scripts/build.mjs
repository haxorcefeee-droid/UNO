import { mkdirSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const out = path.join(root, "dist");
mkdirSync(out, { recursive: true });
mkdirSync(path.join(out, "vendor"), { recursive: true });

for (const file of ["index.html", "style.css", "game.js", "room.js"]) {
  copyFileSync(path.join(root, file), path.join(out, file));
}
copyFileSync(path.join(root, "vendor", "anime.min.js"), path.join(out, "vendor", "anime.min.js"));

// Cache-bust: rewrite asset links in dist/index.html with a short content
// hash (?v=abcd1234). Browsers fetch new assets immediately after each
// deploy instead of serving a stale cached copy — no manual hard refresh.
const html = readFileSync(path.join(out, "index.html"), "utf8");
const hash = (file) =>
  crypto.createHash("sha256").update(readFileSync(path.join(out, file))).digest("hex").slice(0, 8);

const busted = html
  .replace(/style\.css(?=")/g, `style.css?v=${hash("style.css")}`)
  .replace(/game\.js(?=")/g, `game.js?v=${hash("game.js")}`)
  .replace(/room\.js(?=")/g, `room.js?v=${hash("room.js")}`)
  .replace(/vendor\/anime\.min\.js(?=")/g, `vendor/anime.min.js?v=${hash(path.join("vendor", "anime.min.js"))}`);

writeFileSync(path.join(out, "index.html"), busted);
console.log("Build complete — static files copied to dist/ (assets cache-busted)");
