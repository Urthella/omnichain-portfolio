import assert from "node:assert/strict";
import { test } from "node:test";

import { chains } from "../src/chains.ts";
import { fakeFetch } from "./fake.ts";

const rpcResult = (result: unknown) => ({ jsonrpc: "2.0", id: 1, result });

test("EVM chains ask eth_getBalance and read wei", async () => {
  const { fetch, calls } = fakeFetch(() => rpcResult("0x1bc16d674ec80001"));
  const address = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  assert.deepEqual(await chains.base.balances(address, "https://rpc", fetch), [{ symbol: "ETH", amount: "2.000000000000000001" }]);
  assert.deepEqual(calls[0], { url: "https://rpc", body: { jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [address, "latest"] } });
});

test("Solana lamports past 2^53 stay exact", async () => {
  const { fetch } = fakeFetch(() => '{"jsonrpc":"2.0","result":{"context":{"slot":1},"value":9007199254740993},"id":1}');
  const holdings = await chains.solana.balances("So11111111111111111111111111111111111111112", "https://rpc", fetch);
  assert.deepEqual(holdings, [{ symbol: "SOL", amount: "9007199.254740993" }]);
});

test("Sui reads the total SUI balance over GraphQL, and an unknown address has none", async () => {
  let { fetch, calls } = fakeFetch(() => ({ data: { address: { balance: { totalBalance: "31018584912" } } } }));
  assert.deepEqual(await chains.sui.balances("0x5", "https://gql", fetch), [{ symbol: "SUI", amount: "31.018584912" }]);
  assert.match(calls[0].body.query, /address\(address: "0x5"\).*coinType: "0x2::sui::SUI"/);

  ({ fetch } = fakeFetch(() => ({ data: { address: null } })));
  assert.deepEqual(await chains.sui.balances("0x5", "https://gql", fetch), [{ symbol: "SUI", amount: "0" }]);

  ({ fetch } = fakeFetch(() => ({ errors: [{ message: "Invalid address" }] })));
  await assert.rejects(chains.sui.balances("0x5", "https://gql", fetch), /Invalid address/);
});

test("Aptos calls the coin::balance view function", async () => {
  const { fetch, calls } = fakeFetch(() => ["11120868786"]);
  assert.deepEqual(await chains.aptos.balances("0x1", "https://api/v1", fetch), [{ symbol: "APT", amount: "111.20868786" }]);
  assert.equal(calls[0].url, "https://api/v1/view");
  assert.equal(calls[0].body.function, "0x1::coin::balance");
});

test("Cosmos adds up delegations as staked ATOM", async () => {
  const address = "cosmos1jv65s3grqf6v6jl3dp4t6c9t9rk99cd88lyufl";
  let { fetch, calls } = fakeFetch((url) =>
    url.includes("/bank/")
      ? { balance: { denom: "uatom", amount: "1500000" } }
      : { delegation_responses: [{ balance: { amount: "2000000" } }, { balance: { amount: "250000" } }] },
  );
  assert.deepEqual(await chains.cosmos.balances(address, "https://lcd", fetch), [
    { symbol: "ATOM", amount: "1.5" },
    { symbol: "ATOM (staked)", amount: "2.25" },
  ]);
  assert.deepEqual(
    calls.map((c) => c.url),
    [
      `https://lcd/cosmos/bank/v1beta1/balances/${address}/by_denom?denom=uatom`,
      `https://lcd/cosmos/staking/v1beta1/delegations/${address}`,
    ],
  );

  ({ fetch } = fakeFetch((url) => (url.includes("/bank/") ? { balance: { amount: "0" } } : { delegation_responses: [] })));
  assert.deepEqual(await chains.cosmos.balances(address, "https://lcd", fetch), [{ symbol: "ATOM", amount: "0" }]);
});

test("NEAR: a missing implicit account holds nothing, a missing named one is an error", async () => {
  let { fetch } = fakeFetch(() => rpcResult({ amount: "34932495300253242885033633989875", locked: "0" }));
  assert.deepEqual(await chains.near.balances("wrap.near", "https://rpc", fetch), [
    { symbol: "NEAR", amount: "34932495.300253242885033633989875" },
  ]);

  const missing = {
    jsonrpc: "2.0",
    id: 1,
    error: { name: "HANDLER_ERROR", cause: { name: "UNKNOWN_ACCOUNT" }, message: "Server error", data: "account x does not exist while viewing" },
  };
  ({ fetch } = fakeFetch(() => missing));
  assert.deepEqual(await chains.near.balances("ab".repeat(32), "https://rpc", fetch), [{ symbol: "NEAR", amount: "0" }]);
  await assert.rejects(chains.near.balances("nobody.near", "https://rpc", fetch), /UNKNOWN_ACCOUNT/);
});

test("Starknet reads STRK's balanceOf as a 256-bit number", async () => {
  const { fetch, calls } = fakeFetch(() => rpcResult(["0x1", "0x1"]));
  const holdings = await chains.starknet.balances("0x1", "https://rpc", fetch);
  assert.deepEqual(holdings, [{ symbol: "STRK", amount: "340282366920938463463.374607431768211457" }]);
  assert.equal(calls[0].body.method, "starknet_call");
  assert.deepEqual(calls[0].body.params.request.calldata, ["0x1"]);
});

test("TON reads nanotons, and a refusal is an error", async () => {
  let { fetch } = fakeFetch(() => ({ ok: true, result: "1592542221069774" }));
  const address = "EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N";
  assert.deepEqual(await chains.ton.balances(address, "https://tc", fetch), [{ symbol: "TON", amount: "1592542.221069774" }]);
  ({ fetch } = fakeFetch(() => ({ ok: false, error: "rate limited" })));
  await assert.rejects(chains.ton.balances(address, "https://tc", fetch), /rate limited/);
});

test("Bitcoin counts confirmed outputs minus spent ones", async () => {
  const { fetch, calls } = fakeFetch(() => ({
    chain_stats: { funded_txo_sum: 5770003758, spent_txo_sum: 1000000000 },
    mempool_stats: { funded_txo_sum: 999, spent_txo_sum: 0 },
  }));
  const address = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
  assert.deepEqual(await chains.bitcoin.balances(address, "https://esplora/api", fetch), [{ symbol: "BTC", amount: "47.70003758" }]);
  assert.equal(calls[0].url, `https://esplora/api/address/${address}`);
});

test("Hyperliquid lists spot balances and the perps account value, skipping zeros", async () => {
  const { fetch } = fakeFetch((_url, body) =>
    body.type === "spotClearinghouseState"
      ? { balances: [{ coin: "HYPE", total: "12.50" }, { coin: "PURR", total: "0.0" }, { coin: "USDC", total: "3.1" }] }
      : { marginSummary: { accountValue: "10835293.3571840003" } },
  );
  const address = "0xdfc24b077bc1425ad1dea75bcb6f8158e10df303";
  assert.deepEqual(await chains.hyperliquid.balances(address, "https://hl", fetch), [
    { symbol: "HYPE", amount: "12.5" },
    { symbol: "USDC", amount: "3.1" },
    { symbol: "USDC (perps)", amount: "10835293.3571840003" },
  ]);

  const { fetch: empty } = fakeFetch((_url, body) =>
    body.type === "spotClearinghouseState" ? { balances: [] } : { marginSummary: { accountValue: "0.0" } },
  );
  assert.deepEqual(await chains.hyperliquid.balances(address, "https://hl", empty), []);
});

test("HTTP and JSON-RPC errors say what went wrong", async () => {
  const { fetch } = fakeFetch(() => "Too Many Requests", 503);
  await assert.rejects(chains.ethereum.balances("0x1", "https://rpc", fetch), /https:\/\/rpc answered 503: Too Many Requests/);
  const { fetch: refusing } = fakeFetch(() => ({ jsonrpc: "2.0", id: 1, error: { code: -32602, message: "invalid params" } }));
  await assert.rejects(chains.ethereum.balances("0x1", "https://rpc", refusing), /eth_getBalance: invalid params/);
});
