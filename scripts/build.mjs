import { mkdirSync, copyFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, "dist");
mkdirSync(out, { recursive: true });
mkdirSync(path.join(out, "vendor"), { recursive: true });

for (const file of ["index.html", "style.css", "game.js", "room.js"]) {
  copyFileSync(path.join(root, file), path.join(out, file));
}
copyFileSync(path.join(root, "vendor", "anime.min.js"), path.join(out, "vendor", "anime.min.js"));

console.log("Build complete — static files copied to dist/");
