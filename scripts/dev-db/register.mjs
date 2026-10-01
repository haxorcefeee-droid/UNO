import { register } from "node:module";
process.env.DATABASE_URL ||= "postgresql://local:local@localhost/uno";
register("./hooks.mjs", import.meta.url);
