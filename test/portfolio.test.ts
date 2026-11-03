import assert from "node:assert/strict";
import { test } from "node:test";

import type { Fetch } from "../src/chains.ts";
import { portfolio, usdPrices } from "../src/portfolio.ts";
import { fakeFetch } from "./fake.ts";

const ETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const BTC = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";

test("an invalid address is reported without a request", async () => {
  const { fetch, calls } = fakeFetch(() => assert.fail("no request expected"));
  const [result] = await portfolio([{ chain: "ethereum", address: ETH.toLowerCase().replace("c02a", "C02a") }], { fetch });
  assert.equal(result.error, "not a valid ethereum address");
  assert.equal(calls.length, 0);
});

test("one chain failing doesn't stop the others", async () => {
  const { fetch } = fakeFetch((url) => {
    if (url.includes("mempool")) throw new Error("connection refused");
    return { jsonrpc: "2.0", id: 1, result: "0xde0b6b3a7640000" };
  });
  const results = await portfolio(
    [
      { chain: "bitcoin", address: BTC },
      { chain: "ethereum", address: ETH },
    ],
    { fetch },
  );
  assert.equal(results[0].error, "connection refused");
  assert.deepEqual(results[1].holdings, [{ symbol: "ETH", amount: "1" }]);
});

test("wallets on one chain go one at a time, different chains at once", async () => {
  const inFlight = new Map<string, number>();
  const most = new Map<string, number>();
  let total = 0;
  let mostTotal = 0;
  const fetch: Fetch = async (url) => {
    const host = new URL(url).host;
    inFlight.set(host, (inFlight.get(host) ?? 0) + 1);
    most.set(host, Math.max(most.get(host) ?? 0, inFlight.get(host)!));
    mostTotal = Math.max(mostTotal, ++total);
    await new Promise((resolve) => setTimeout(resolve, 20));
    inFlight.set(host, inFlight.get(host)! - 1);
    total--;
    return Response.json({ jsonrpc: "2.0", id: 1, result: "0x0" });
  };
  const chainNames = ["ethereum", "ethereum", "ethereum", "base", "base", "arbitrum"] as const;
  await portfolio(
    chainNames.map((chain) => ({ chain, address: ETH })),
    { fetch },
  );
  assert.deepEqual([...most.values()], [1, 1, 1]);
  assert.equal(mostTotal, 3);
});

test("a slow endpoint times out", { timeout: 5000 }, async () => {
  const fetch: Fetch = (_url, init) =>
    new Promise((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason)));
  const [result] = await portfolio([{ chain: "ethereum", address: ETH }], { fetch, timeoutMs: 50 });
  assert.equal(result.error, "no answer in 50 ms");
});

test("a 429 is retried after a pause", async () => {
  let attempts = 0;
  const fetch: Fetch = async () =>
    ++attempts < 3 ? new Response("slow down", { status: 429 }) : Response.json({ ok: true, result: "1000000000" });
  const [result] = await portfolio([{ chain: "ton", address: "EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N" }], { fetch });
  assert.deepEqual(result.holdings, [{ symbol: "TON", amount: "1" }]);
  assert.equal(attempts, 3);
});

test("your own endpoint replaces the default", async () => {
  const { fetch, calls } = fakeFetch(() => ({ jsonrpc: "2.0", id: 1, result: "0x0" }));
  await portfolio([{ chain: "ethereum", address: ETH }], { fetch, endpoints: { ethereum: "http://localhost:8545" } });
  assert.equal(calls[0].url, "http://localhost:8545");
});

test("prices are looked up once per coin, with suffixes like (staked) ignored", async () => {
  const { fetch, calls } = fakeFetch(() => ({ cosmos: { usd: 1.4 }, "usd-coin": { usd: 1 } }));
  const prices = await usdPrices(["ATOM", "ATOM (staked)", "USDC (perps)", "PURR"], fetch);
  assert.deepEqual([...prices], [["ATOM", 1.4], ["ATOM (staked)", 1.4], ["USDC (perps)", 1]]);
  assert.match(calls[0].url, /ids=cosmos,usd-coin$/);
});
