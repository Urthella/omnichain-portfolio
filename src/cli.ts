#!/usr/bin/env node
import { type ChainName, chains, isChainName } from "./chains.ts";
import { type Wallet, portfolio, usdPrices } from "./portfolio.ts";

const USAGE = `usage: node src/cli.ts [--usd] [--json] [--endpoint CHAIN=URL]... CHAIN:ADDRESS...

  --usd                  add USD values from CoinGecko
  --json                 print JSON, with exact amounts
  --endpoint CHAIN=URL   use your own endpoint for a chain

chains: ${Object.keys(chains).join(", ")}`;

function fail(message: string): never {
  console.error(`${message}\n\n${USAGE}`);
  process.exit(2);
}

const wallets: Wallet[] = [];
const endpoints: Partial<Record<ChainName, string>> = {};
let usd = false;
let json = false;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "-h" || arg === "--help") {
    console.log(USAGE);
    process.exit(0);
  } else if (arg === "--usd") {
    usd = true;
  } else if (arg === "--json") {
    json = true;
  } else if (arg === "--endpoint") {
    const [chain, url] = (args[++i] ?? "").split(/=(.*)/s);
    if (!isChainName(chain) || !url) fail(`--endpoint needs CHAIN=URL`);
    endpoints[chain] = url;
  } else {
    // Split at the first colon only: raw TON addresses contain one.
    const [chain, address] = arg.split(/:(.*)/s);
    if (!isChainName(chain) || !address) fail(`not CHAIN:ADDRESS: ${arg}`);
    wallets.push({ chain, address });
  }
}
if (wallets.length === 0) fail("no wallets given");

const results = await portfolio(wallets, { endpoints });
let prices = new Map<string, number>();
let priceError = "";
if (usd) {
  const symbols = results.flatMap((r) => r.holdings ?? []).map((h) => h.symbol);
  prices = await usdPrices(symbols).catch((e) => ((priceError = String(e.message ?? e)), new Map()));
}
const value = (symbol: string, amount: string) => (prices.has(symbol) ? Number(amount) * prices.get(symbol)! : undefined);

if (json) {
  const out = results.map((r) => ({
    ...r,
    holdings: r.holdings?.map((h) => ({ ...h, ...(usd ? { usd: value(h.symbol, h.amount) } : {}) })),
  }));
  console.log(JSON.stringify(out, null, 2));
} else {
  const short = (a: string) => (a.length > 16 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a);
  // Shows six decimal places at most, cut rather than rounded so it never overstates.
  const display = (amount: string) => amount.replace(/(\.\d{6})\d+$/, "$1");
  const money = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  const rows: string[][] = [["chain", "address", "amount", "", ...(usd ? ["usd"] : [])]];
  let total = 0;
  for (const r of results) {
    if (r.error) continue;
    if (r.holdings!.length === 0) rows.push([r.chain, short(r.address), "0", "", ...(usd ? [""] : [])]);
    for (const h of r.holdings!) {
      const v = value(h.symbol, h.amount);
      total += v ?? 0;
      rows.push([r.chain, short(r.address), display(h.amount), h.symbol, ...(usd ? [v === undefined ? "?" : money(v)] : [])]);
    }
  }
  if (usd) rows.push(["total", "", "", "", money(total)]);
  const widths = rows[0].map((_, i) => Math.max(...rows.map((row) => row[i].length)));
  for (const row of rows) {
    console.log(row.map((cell, i) => (i === 2 || i === 4 ? cell.padStart(widths[i]) : cell.padEnd(widths[i]))).join("  ").trimEnd());
  }
  if (priceError) console.error(`\nno USD prices: ${priceError}`);
}
const failed = results.filter((r) => r.error);
for (const r of failed) console.error(`${r.chain} ${r.address}: ${r.error}`);
process.exitCode = failed.length > 0 ? 1 : 0;
