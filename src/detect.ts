import { type ChainName, chains } from "./chains.ts";

/**
 * The chains an address could belong to, going by its format alone. Some formats are shared: an
 * EVM address is the same on Ethereum, Base, Arbitrum and Hyperliquid, and `0x` with 64 hex digits
 * can be Sui, Aptos or Starknet. Short forms like `0x1`, NEAR names without a dot and NEAR's
 * EVM-style accounts are too ambiguous to guess, so those need a chain.
 */
export function detectChains(address: string): ChainName[] {
  return (Object.keys(chains) as ChainName[]).filter((name) => {
    if (!chains[name].isAddress(address)) return false;
    if (name === "near") return address.includes(".") || /^[0-9a-f]{64}$/.test(address);
    if (name === "sui" || name === "aptos" || name === "starknet") return /^0x[0-9a-fA-F]{41,64}$/.test(address);
    return true;
  });
}
