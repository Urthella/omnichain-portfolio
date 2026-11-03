import { type ChainName, type Fetch, type Holding, chains } from "./chains.ts";

export interface Wallet {
  chain: ChainName;
  address: string;
}

export interface Result extends Wallet {
  holdings?: Holding[];
  error?: string;
}

export interface Options {
  fetch?: Fetch;
  /** Endpoints to use instead of the public defaults. */
  endpoints?: Partial<Record<ChainName, string>>;
  timeoutMs?: number;
}

/**
 * Reads every wallet's balances. A wallet that fails gets an `error` and the rest still come back.
 * Chains are queried at once, and one chain's wallets one after another, since public endpoints
 * limit how fast one client may ask.
 */
export async function portfolio(wallets: Wallet[], options: Options = {}): Promise<Result[]> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const fetch = politely(options.fetch ?? globalThis.fetch, timeoutMs);
  const results: Result[] = wallets.map((wallet) => ({ ...wallet }));
  const byChain = Map.groupBy(results, (result) => result.chain);
  await Promise.all(
    [...byChain].map(async ([name, rows]) => {
      const chain = chains[name];
      for (const row of rows) {
        if (!chain.isAddress(row.address)) {
          row.error = `not a valid ${name} address`;
          continue;
        }
        try {
          row.holdings = await chain.balances(row.address, options.endpoints?.[name] ?? chain.endpoint, fetch);
        } catch (e) {
          row.error = e instanceof Error && e.name === "TimeoutError" ? `no answer in ${timeoutMs} ms` : String(e instanceof Error ? e.message : e);
        }
      }
    }),
  );
  return results;
}

/** Adds a timeout, and waits and retries when an endpoint says it's being asked too often. */
function politely(fetch: Fetch, timeoutMs: number): Fetch {
  return async (url, init) => {
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (response.status !== 429 || attempt === 2) return response;
      // toncenter, for one, allows a request a second without an API key.
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }
  };
}

const COINGECKO_IDS: Record<string, string> = {
  ETH: "ethereum",
  SOL: "solana",
  SUI: "sui",
  APT: "aptos",
  ATOM: "cosmos",
  NEAR: "near",
  STRK: "starknet",
  TON: "the-open-network",
  BTC: "bitcoin",
  HYPE: "hyperliquid",
  USDC: "usd-coin",
};

/** USD prices from CoinGecko's free API, by symbol. Symbols it doesn't know are left out. */
export async function usdPrices(symbols: string[], fetch: Fetch = globalThis.fetch): Promise<Map<string, number>> {
  const ids = new Map(symbols.map((s) => [s, COINGECKO_IDS[s.split(" ")[0]]] as const).filter(([, id]) => id));
  if (ids.size === 0) return new Map();
  const url = `https://api.coingecko.com/api/v3/simple/price?vs_currencies=usd&ids=${[...new Set(ids.values())].join(",")}`;
  const response = await politely(fetch, 15_000)(url);
  if (!response.ok) throw new Error(`CoinGecko answered ${response.status}`);
  const prices = (await response.json()) as Record<string, { usd?: number }>;
  return new Map([...ids].flatMap(([symbol, id]) => (prices[id]?.usd === undefined ? [] : [[symbol, prices[id].usd!]])));
}
