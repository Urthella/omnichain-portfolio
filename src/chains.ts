// One adapter per chain. Each checks its address format and reads native balances from a public
// endpoint, which can be swapped for your own.

import {
  isBitcoinAddress,
  isCosmosAddress,
  isEvmAddress,
  isMoveAddress,
  isNearAccount,
  isNearImplicit,
  isSolanaAddress,
  isStarknetAddress,
  isTonAddress,
} from "./address.ts";
import { formatUnits, normalizeDecimal } from "./units.ts";

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface Holding {
  symbol: string;
  /** An exact decimal string. */
  amount: string;
}

export interface Chain {
  /** The default endpoint: an RPC URL, or an API's base URL. */
  endpoint: string;
  isAddress(address: string): boolean;
  balances(address: string, endpoint: string, fetch: Fetch): Promise<Holding[]>;
}

async function request(fetch: Fetch, url: string, body?: unknown): Promise<string> {
  const init: RequestInit =
    body === undefined
      ? {}
      : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) throw new Error(`${url} answered ${response.status}: ${text.slice(0, 200)}`);
  return text;
}

async function rpc(fetch: Fetch, url: string, method: string, params: unknown, parse = JSON.parse): Promise<any> {
  const reply = parse(await request(fetch, url, { jsonrpc: "2.0", id: 1, method, params }));
  if (reply.error) {
    const { message, cause, data } = reply.error;
    throw new Error([`${method}: ${message}`, cause?.name, typeof data === "string" ? data : ""].filter(Boolean).join(": "));
  }
  return reply.result;
}

/** Parses JSON keeping integers exact, since a balance in lamports can pass 2^53. */
function parseExact(text: string): any {
  return JSON.parse(text, (_key, value, context?: { source: string }) =>
    typeof value === "number" && Number.isInteger(value) && context ? BigInt(context.source) : value,
  );
}

const evm = (endpoint: string): Chain => ({
  endpoint,
  isAddress: isEvmAddress,
  async balances(address, url, fetch) {
    const wei = BigInt(await rpc(fetch, url, "eth_getBalance", [address, "latest"]));
    return [{ symbol: "ETH", amount: formatUnits(wei, 18) }];
  },
});

const STRK = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
/** The low 250 bits of keccak256("balanceOf"). */
export const BALANCE_OF = "0x2e4263afad30923c891518314c3c95dbe830a16874e8abc5777a9a20b54c76e";

export const chains = {
  ethereum: evm("https://ethereum-rpc.publicnode.com"),
  base: evm("https://mainnet.base.org"),
  arbitrum: evm("https://arb1.arbitrum.io/rpc"),

  solana: {
    endpoint: "https://api.mainnet-beta.solana.com",
    isAddress: isSolanaAddress,
    async balances(address, url, fetch) {
      const result = await rpc(fetch, url, "getBalance", [address], parseExact);
      return [{ symbol: "SOL", amount: formatUnits(BigInt(result.value), 9) }];
    },
  },

  sui: {
    // Public fullnodes no longer serve JSON-RPC, so this uses GraphQL.
    endpoint: "https://graphql.mainnet.sui.io/graphql",
    isAddress: isMoveAddress,
    async balances(address, url, fetch) {
      const query = `{ address(address: "${address}") { balance(coinType: "0x2::sui::SUI") { totalBalance } } }`;
      const reply = JSON.parse(await request(fetch, url, { query }));
      if (reply.errors?.length) throw new Error(reply.errors[0].message);
      const mist = BigInt(reply.data.address?.balance?.totalBalance ?? 0);
      return [{ symbol: "SUI", amount: formatUnits(mist, 9) }];
    },
  },

  aptos: {
    endpoint: "https://api.mainnet.aptoslabs.com/v1",
    isAddress: isMoveAddress,
    async balances(address, url, fetch) {
      // coin::balance also counts APT held as a fungible asset.
      const body = { function: "0x1::coin::balance", type_arguments: ["0x1::aptos_coin::AptosCoin"], arguments: [address] };
      const [octas] = JSON.parse(await request(fetch, `${url}/view`, body));
      return [{ symbol: "APT", amount: formatUnits(BigInt(octas), 8) }];
    },
  },

  cosmos: {
    endpoint: "https://cosmos-rest.publicnode.com",
    isAddress: isCosmosAddress,
    async balances(address, url, fetch) {
      const bank = JSON.parse(await request(fetch, `${url}/cosmos/bank/v1beta1/balances/${address}/by_denom?denom=uatom`));
      // ponytail: reads the first page of delegations, 100 validators; follow next_key if anyone has more.
      const staking = JSON.parse(await request(fetch, `${url}/cosmos/staking/v1beta1/delegations/${address}`));
      const staked = staking.delegation_responses.reduce(
        (sum: bigint, d: { balance: { amount: string } }) => sum + BigInt(d.balance.amount),
        0n,
      );
      return [
        { symbol: "ATOM", amount: formatUnits(BigInt(bank.balance?.amount ?? 0), 6) },
        ...(staked > 0n ? [{ symbol: "ATOM (staked)", amount: formatUnits(staked, 6) }] : []),
      ];
    },
  },

  near: {
    endpoint: "https://rpc.mainnet.fastnear.com",
    isAddress: isNearAccount,
    async balances(address, url, fetch) {
      try {
        const params = { request_type: "view_account", finality: "final", account_id: address };
        const account = await rpc(fetch, url, "query", params);
        return [{ symbol: "NEAR", amount: formatUnits(BigInt(account.amount), 24) }];
      } catch (e) {
        // An implicit account exists only once something is sent to it. A named one has to be created.
        if (isNearImplicit(address) && /UNKNOWN_ACCOUNT|does not exist/.test(String(e))) return [{ symbol: "NEAR", amount: "0" }];
        throw e;
      }
    },
  },

  starknet: {
    endpoint: "https://starknet-rpc.publicnode.com",
    isAddress: isStarknetAddress,
    async balances(address, url, fetch) {
      const request = { contract_address: STRK, entry_point_selector: BALANCE_OF, calldata: [address] };
      const [low, high] = await rpc(fetch, url, "starknet_call", { request, block_id: "latest" });
      return [{ symbol: "STRK", amount: formatUnits(BigInt(low) + (BigInt(high) << 128n), 18) }];
    },
  },

  ton: {
    endpoint: "https://toncenter.com/api/v2",
    isAddress: isTonAddress,
    async balances(address, url, fetch) {
      const reply = JSON.parse(await request(fetch, `${url}/getAddressBalance?address=${encodeURIComponent(address)}`));
      if (!reply.ok) throw new Error(reply.error ?? "toncenter refused the request");
      return [{ symbol: "TON", amount: formatUnits(BigInt(reply.result), 9) }];
    },
  },

  bitcoin: {
    endpoint: "https://mempool.space/api",
    isAddress: isBitcoinAddress,
    async balances(address, url, fetch) {
      // Confirmed only: what's in the mempool can still be replaced.
      const { chain_stats: stats } = JSON.parse(await request(fetch, `${url}/address/${address}`));
      return [{ symbol: "BTC", amount: formatUnits(BigInt(stats.funded_txo_sum) - BigInt(stats.spent_txo_sum), 8) }];
    },
  },

  hyperliquid: {
    endpoint: "https://api.hyperliquid.xyz",
    isAddress: isEvmAddress,
    async balances(address, url, fetch) {
      const spot = JSON.parse(await request(fetch, `${url}/info`, { type: "spotClearinghouseState", user: address }));
      const perps = JSON.parse(await request(fetch, `${url}/info`, { type: "clearinghouseState", user: address }));
      const holdings: Holding[] = spot.balances
        .map((b: { coin: string; total: string }) => ({ symbol: b.coin, amount: normalizeDecimal(b.total) }))
        .filter((h: Holding) => h.amount !== "0");
      const accountValue = normalizeDecimal(perps.marginSummary.accountValue);
      if (accountValue !== "0") holdings.push({ symbol: "USDC (perps)", amount: accountValue });
      return holdings;
    },
  },
} satisfies Record<string, Chain>;

export type ChainName = keyof typeof chains;

export function isChainName(name: string): name is ChainName {
  return Object.hasOwn(chains, name);
}
