// Checks live results against a second, independent source where one exists. Run it with
// `npm run crosscheck`. It isn't part of the tests, since it depends on public endpoints.

import { isBitcoinAddress, isTonAddress } from "../src/address.ts";
import { type ChainName, chains } from "../src/chains.ts";
import { portfolio } from "../src/portfolio.ts";

const known: Record<ChainName, string> = {
  ethereum: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
  base: "0x4200000000000000000000000000000000000006", // WETH
  arbitrum: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", // WETH
  solana: "So11111111111111111111111111111111111111112", // the wrapped SOL mint
  sui: "0x5", // the system state object
  aptos: "0x1", // the framework account
  cosmos: "cosmos1jv65s3grqf6v6jl3dp4t6c9t9rk99cd88lyufl", // the distribution module
  near: "wrap.near", // wrapped NEAR
  starknet: "0x00000005dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b", // Ekubo
  ton: "EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N", // TON Foundation (old)
  bitcoin: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", // the genesis block's address
  hyperliquid: "0xdfc24b077bc1425ad1dea75bcb6f8158e10df303", // the HLP vault
};

const second: Partial<Record<ChainName, string>> = {
  ethereum: "https://eth.drpc.org",
  base: "https://base-rpc.publicnode.com",
  arbitrum: "https://arbitrum-one-rpc.publicnode.com",
  solana: "https://solana-rpc.publicnode.com",
  aptos: "https://aptos-rest.publicnode.com/v1",
  cosmos: "https://rest.cosmos.directory/cosmoshub",
  near: "https://rpc.mainnet.near.org",
  starknet: "https://api.cartridge.gg/x/starknet/mainnet",
  bitcoin: "https://blockstream.info/api",
};

const json = async (url: string, body?: unknown) =>
  (
    await fetch(url, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {})
  ).json() as Promise<any>;

let problems = 0;
const report = (ok: boolean, line: string) => {
  if (!ok) problems++;
  console.log(`${ok ? "ok  " : "FAIL"} ${line}`);
};
// Balances like WETH's move every block, so two reads a moment apart can differ slightly.
const close = (a: string, b: string) => Math.abs(Number(a) - Number(b)) <= Math.abs(Number(a)) * 1e-3;

console.log("== each chain, from two sources");
const wallets = Object.entries(known).map(([chain, address]) => ({ chain: chain as ChainName, address }));
const [first, again] = await Promise.all([portfolio(wallets), portfolio(wallets, { endpoints: second })]);
for (const [i, result] of first.entries()) {
  const a = result.holdings?.[0]?.amount;
  const b = again[i].holdings?.[0]?.amount;
  const source = second[result.chain] ? new URL(second[result.chain]!).host : "no second source";
  report(!result.error && !again[i].error && a !== undefined && close(a, b!), `${result.chain}: ${a} vs ${b} (${source}) ${result.error ?? again[i].error ?? ""}`);
}

console.log("== TON against tonapi.io, and both address forms");
const tonapi = await json(`https://tonapi.io/v2/accounts/${known.ton}`);
const ton = first.find((r) => r.chain === "ton")!.holdings![0].amount;
report(close(ton, String(Number(tonapi.balance) / 1e9)), `toncenter ${ton} vs tonapi ${tonapi.balance / 1e9}`);
const forms = (await json(`${chains.ton.endpoint}/detectAddress?address=${known.ton}`)).result;
for (const form of [forms.bounceable.b64url, forms.non_bounceable.b64url, forms.raw_form])
  report(isTonAddress(form), `accepts ${form}`);

console.log("== Bitcoin address checks against mempool.space");
const vectors = [
  "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
  "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb",
  "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy",
  "BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4",
  "bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3",
  "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0",
  "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5",
  "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kemeawh",
  "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqh2y7hd",
  "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
];
for (const address of vectors) {
  const { isvalid } = await json(`https://mempool.space/api/v1/validate-address/${address}`);
  report(isvalid === isBitcoinAddress(address), `${address}: mempool.space says ${isvalid}, we say ${isBitcoinAddress(address)}`);
}

console.log("== Cosmos staking, with a real delegator");
const validators = await json(`${chains.cosmos.endpoint}/cosmos/staking/v1beta1/validators?status=BOND_STATUS_BONDED&pagination.limit=1`);
const operator = validators.validators[0].operator_address;
const delegations = await json(`${chains.cosmos.endpoint}/cosmos/staking/v1beta1/validators/${operator}/delegations?pagination.limit=1`);
const delegator = delegations.delegation_responses[0].delegation.delegator_address;
const [staked, stakedAgain] = await Promise.all([
  portfolio([{ chain: "cosmos", address: delegator }]),
  portfolio([{ chain: "cosmos", address: delegator }], { endpoints: second }),
]);
const holdings = staked[0].holdings ?? [];
report(
  holdings.some((h) => h.symbol === "ATOM (staked)") && JSON.stringify(holdings) === JSON.stringify(stakedAgain[0].holdings),
  `${delegator}: ${JSON.stringify(holdings)}`,
);

console.log(problems === 0 ? "\nall agree" : `\n${problems} problems`);
process.exitCode = problems === 0 ? 0 : 1;
