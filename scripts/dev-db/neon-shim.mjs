// Local stand-in for @neondatabase/serverless backed by an in-memory Postgres
// (PGlite). Dev and tests only: lets the whole API run without a Neon URL.
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite(process.env.UNO_PGLITE_DIR || undefined);

const run = async (text, params = []) => (await db.query(text, params)).rows;

export function neon() {
  const sql = (strings, ...values) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i++) text += "$" + (i + 1) + strings[i + 1];
    return run(text, values);
  };
  sql.query = run;
  return sql;
}
