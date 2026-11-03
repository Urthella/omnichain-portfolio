import assert from "node:assert/strict";
import { test } from "node:test";

import { formatUnits, normalizeDecimal } from "../src/units.ts";

test("formatUnits is exact", () => {
  assert.equal(formatUnits(0n, 18), "0");
  assert.equal(formatUnits(1n, 18), "0.000000000000000001");
  assert.equal(formatUnits(10n ** 18n, 18), "1");
  assert.equal(formatUnits(1_500_000_000n, 9), "1.5");
  assert.equal(formatUnits(2n ** 53n + 1n, 9), "9007199.254740993");
  assert.equal(formatUnits(34932495300253242885033633989875n, 24), "34932495.300253242885033633989875");
  assert.equal(formatUnits(-5n, 2), "-0.05");
  assert.equal(formatUnits(42n, 0), "42");
});

test("normalizeDecimal keeps every digit and refuses what isn't a number", () => {
  assert.equal(normalizeDecimal("10835293.3571840003"), "10835293.3571840003");
  assert.equal(normalizeDecimal("0.0"), "0");
  assert.equal(normalizeDecimal("-0.0"), "0");
  assert.equal(normalizeDecimal("007.50"), "7.5");
  assert.equal(normalizeDecimal("-1.20"), "-1.2");
  for (const bad of ["", "1e5", "1.", ".5", "NaN", "1,5"]) assert.throws(() => normalizeDecimal(bad), new RegExp(bad));
});
