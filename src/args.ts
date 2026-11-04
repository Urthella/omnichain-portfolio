import { type ChainName, isChainName } from "./chains.ts";
import { detectChains } from "./detect.ts";
import type { Wallet } from "./portfolio.ts";

export interface Args {
  wallets: Wallet[];
  endpoints: Partial<Record<ChainName, string>>;
  usd: boolean;
  json: boolean;
  help: boolean;
}

/** Parses the command line, throwing a message for the user when it can't. */
export function parseArgs(args: string[]): Args {
  const parsed: Args = { wallets: [], endpoints: {}, usd: false, json: false, help: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-h" || arg === "--help") {
      parsed.help = true;
    } else if (arg === "--usd") {
      parsed.usd = true;
    } else if (arg === "--json") {
      parsed.json = true;
    } else if (arg === "--endpoint") {
      const [chain, url] = (args[++i] ?? "").split(/=(.*)/s);
      if (!isChainName(chain) || !url) throw new Error("--endpoint needs CHAIN=URL");
      parsed.endpoints[chain] = url;
    } else {
      // Split at the first colon only: raw TON addresses like 0:83df… contain one.
      const [prefix, rest] = arg.split(/:(.*)/s);
      if (isChainName(prefix) && rest) {
        parsed.wallets.push({ chain: prefix, address: rest });
        continue;
      }
      if (/^[a-z]+$/.test(prefix) && rest) throw new Error(`unknown chain: ${prefix}`);
      const found = detectChains(arg);
      if (found.length === 0) throw new Error(`no chain uses this address format, so give one as CHAIN:ADDRESS: ${arg}`);
      parsed.wallets.push(...found.map((chain) => ({ chain, address: arg })));
    }
  }
  if (!parsed.help && parsed.wallets.length === 0) throw new Error("no wallets given");
  return parsed;
}
