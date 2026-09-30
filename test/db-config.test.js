import assert from "node:assert/strict";
import test from "node:test";

import { handleApi } from "../api-core.js";
import {
  normalizeConnectionString,
  publicDbError,
  resolveConnectionString,
} from "../db.js";

const SAMPLE =
  "postgresql://alex:secret@ep-cool.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

test("strips quotes, psql prefix, and KEY= wrappers", () => {
  assert.equal(normalizeConnectionString(`  "${SAMPLE}"  `), SAMPLE);
  assert.equal(normalizeConnectionString(`psql '${SAMPLE}'`), SAMPLE);
  assert.equal(normalizeConnectionString(`DATABASE_URL="${SAMPLE}"`), SAMPLE);
  assert.equal(normalizeConnectionString(""), "");
  assert.equal(normalizeConnectionString(undefined), "");
});

test("reads Neon and Vercel env names", () => {
  assert.deepEqual(resolveConnectionString({}), { url: "", source: null });
  assert.deepEqual(resolveConnectionString({ POSTGRES_URL: `"${SAMPLE}"` }), {
    url: SAMPLE,
    source: "POSTGRES_URL",
  });
  assert.equal(resolveConnectionString({ DATABASE_URL: SAMPLE, POSTGRES_URL: "postgresql://other" }).source, "DATABASE_URL");
});

test("hides credentials in driver errors", () => {
  const message = publicDbError(new Error(
    "Database connection string provided to `neon()` is not a valid URL. Connection string: " + SAMPLE
  ));
  assert.match(message, /not a valid Neon connection string/);
  assert.equal(message.includes("secret"), false);
  assert.match(publicDbError(new Error("DATABASE_URL is not set")), /not set on this deployment/);
});

test("health reports a missing connection string", async () => {
  const prev = process.env.DATABASE_URL;
  const prevPg = process.env.POSTGRES_URL;
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_PRISMA_URL;
  delete process.env.DATABASE_URL_UNPOOLED;
  delete process.env.POSTGRES_URL_NON_POOLING;
  try {
    const req = { method: "GET", headers: {}, on() {} };
    const health = await handleApi(req, null, new URL("http://localhost/api/health"));
    assert.equal(health.status, 500);
    assert.equal(health.body.ok, false);
    assert.match(health.body.error, /DATABASE_URL is not set/);

    const scores = await handleApi(req, null, new URL("http://localhost/api/scores?limit=1"));
    assert.equal(scores.status, 500);
    assert.match(scores.body.error, /DATABASE_URL is not set/);
  } finally {
    if (prev === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prev;
    if (prevPg === undefined) delete process.env.POSTGRES_URL;
    else process.env.POSTGRES_URL = prevPg;
  }
});
