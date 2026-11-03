import assert from "node:assert/strict";
import { test } from "node:test";

import { keccak_256 } from "@noble/hashes/sha3.js";

import {
  isBitcoinAddress,
  isCosmosAddress,
  isEvmAddress,
  isMoveAddress,
  isNearAccount,
  isSolanaAddress,
  isStarknetAddress,
  isTonAddress,
} from "../src/address.ts";

function check(name: string, isAddress: (a: string) => boolean, valid: string[], invalid: string[]) {
  test(name, () => {
    for (const a of valid) assert.ok(isAddress(a), `should accept ${a}`);
    for (const a of invalid) assert.ok(!isAddress(a), `should refuse ${a}`);
  });
}

check(
  "EVM addresses, with EIP-55 checksums",
  isEvmAddress,
  [
    // From EIP-55.
    "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
    "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359",
    "0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB",
    "0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb",
    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    "0xC02AAA39B223FE8D0A0E5C4F27EAD9083C756CC2",
  ],
  [
    "0xc02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeD",
    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc",
    "C02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2a1",
    "0xG02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  ],
);

check(
  "Solana addresses",
  isSolanaAddress,
  ["So11111111111111111111111111111111111111112", "11111111111111111111111111111111"],
  ["So1111111111111111111111111111111111111111", "So11111111111111111111111111111111111111110", "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"],
);

check(
  "Bitcoin addresses",
  isBitcoinAddress,
  [
    "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
    "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy",
    // BIP 173 and BIP 350 examples.
    "BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4",
    "bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3",
    "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0",
  ],
  [
    "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb",
    "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5",
    "bc1qW508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
    // Version 0 with a bech32m checksum, and version 1 with plain bech32.
    "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kemeawh",
    "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqh2y7hd",
    // Testnet.
    "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
    "cosmos1jv65s3grqf6v6jl3dp4t6c9t9rk99cd88lyufl",
  ],
);

check(
  "Cosmos Hub addresses",
  isCosmosAddress,
  ["cosmos1jv65s3grqf6v6jl3dp4t6c9t9rk99cd88lyufl"],
  ["cosmos1jv65s3grqf6v6jl3dp4t6c9t9rk99cd88lyufm", "osmo1jv65s3grqf6v6jl3dp4t6c9t9rk99cd80yhvld", "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"],
);

check(
  "Sui and Aptos addresses",
  isMoveAddress,
  ["0x1", "0x5", "0x8f8ea04f3b751533db8b8da0a40eba1ca8332a92680f058d83b9459d061aaa54"],
  ["0x", "1", "0xg", "0x8f8ea04f3b751533db8b8da0a40eba1ca8332a92680f058d83b9459d061aaa540"],
);

check(
  "Starknet addresses",
  isStarknetAddress,
  ["0x00000005dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b", "0x1"],
  [`0x8${"0".repeat(62)}`, "0x", "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938dz"],
);

check(
  "NEAR accounts",
  isNearAccount,
  ["wrap.near", "app.ref-finance.near", "a_b.c-d.near", "ab", "0".repeat(63) + "a", "0x" + "ab".repeat(20)],
  ["Wrap.near", "a", "wrap..near", ".near", "wrap.near.", "-wrap.near", "a".repeat(65), "0x" + "AB".repeat(20)],
);

check(
  "TON addresses",
  isTonAddress,
  [
    "EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N",
    "0:83dfd552e63729b472fcbcc8c45ebcc6691702558b68ec7527e1ba403a0f31a8",
    "-1:" + "3".repeat(64),
  ],
  [
    "EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2O",
    // Same bytes with the non-bounceable tag but the old checksum.
    "UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N",
    "1:83dfd552e63729b472fcbcc8c45ebcc6691702558b68ec7527e1ba403a0f31a8",
    "EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2",
    // The testnet form of the same account.
    "kQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqKYH",
  ],
);

test("the Starknet balanceOf selector is the low 250 bits of its keccak", async () => {
  const { BALANCE_OF } = await import("../src/chains.ts");
  const hash = keccak_256(new TextEncoder().encode("balanceOf"));
  const n = hash.reduce((acc, b) => (acc << 8n) | BigInt(b), 0n) & ((1n << 250n) - 1n);
  assert.equal(BigInt(BALANCE_OF), n);
});
