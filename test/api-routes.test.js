import assert from "node:assert/strict";
import test from "node:test";
import { slugParts } from "../api/_run.js";

test("splits room slugs from a string or array", () => {
  assert.deepEqual(slugParts("state/ABCDE"), ["state", "ABCDE"]);
  assert.deepEqual(slugParts(["list"]), ["list"]);
  assert.deepEqual(slugParts(""), []);
  assert.deepEqual(slugParts(undefined), []);
});
