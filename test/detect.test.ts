import assert from "node:assert/strict";
import { test } from "node:test";

import { parseArgs } from "../src/args.ts";
import { detectChains } from "../src/detect.ts";

const EVM = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const TON_RAW = "0:83dfd552e63729b472fcbcc8c45ebcc6691702558b68ec7527e1ba403a0f31a8";

test("each address format maps to the chains that use it", () => {
  const cases: [string, string[]][] = [
    [EVM, ["ethereum", "base", "arbitrum", "hyperliquid"]],
    [EVM.toLowerCase(), ["ethereum", "base", "arbitrum", "hyperliquid"]],
    ["0x00000005dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b", ["sui", "aptos", "starknet"]],
    // At or above 2^251, so it can't be a Starknet address.
    ["0x8f8ea04f3b751533db8b8da0a40eba1ca8332a92680f058d83b9459d061aaa54", ["sui", "aptos"]],
    ["So11111111111111111111111111111111111111112", ["solana"]],
    ["1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", ["bitcoin"]],
    ["bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0", ["bitcoin"]],
    ["cosmos1jv65s3grqf6v6jl3dp4t6c9t9rk99cd88lyufl", ["cosmos"]],
    ["EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N", ["ton"]],
    [TON_RAW, ["ton"]],
    ["wrap.near", ["near"]],
    ["ab".repeat(32), ["near"]],
  ];
  for (const [address, chains] of cases) assert.deepEqual(detectChains(address), chains, address);
});

test("formats too ambiguous to guess, and typos, match nothing", () => {
  for (const address of ["0x1", "near", "hello", EVM.replace("C02a", "c02a"), "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb"])
    assert.deepEqual(detectChains(address), [], address);
});

test("the command line takes CHAIN:ADDRESS or a bare address", () => {
  const { wallets } = parseArgs(["bitcoin:1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", EVM, TON_RAW, `ton:${TON_RAW}`]);
  assert.deepEqual(wallets, [
    { chain: "bitcoin", address: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa" },
    ...["ethereum", "base", "arbitrum", "hyperliquid"].map((chain) => ({ chain, address: EVM })),
    { chain: "ton", address: TON_RAW },
    { chain: "ton", address: TON_RAW },
  ]);
  // Given a chain, the address is passed on as is, and checked later.
  assert.deepEqual(parseArgs(["aptos:0x1"]).wallets, [{ chain: "aptos", address: "0x1" }]);
});

test("the command line explains what it can't use", () => {
  assert.throws(() => parseArgs([`etherum:${EVM}`]), /unknown chain: etherum/);
  assert.throws(() => parseArgs(["0x1"]), /no chain uses this address format/);
  assert.throws(() => parseArgs([]), /no wallets given/);
  assert.throws(() => parseArgs(["--endpoint", "ethereum", EVM]), /--endpoint needs CHAIN=URL/);
  assert.throws(() => parseArgs(["--endpoint", "eth=http://x", EVM]), /--endpoint needs CHAIN=URL/);
});

test("flags", () => {
  const args = parseArgs(["--usd", "--json", "--endpoint", "ethereum=http://localhost:8545/?a=b", EVM]);
  assert.equal(args.usd, true);
  assert.equal(args.json, true);
  assert.deepEqual(args.endpoints, { ethereum: "http://localhost:8545/?a=b" });
  assert.equal(parseArgs(["--help"]).help, true);
});
