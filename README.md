# omnichain-portfolio

[![ci](https://github.com/Urthella/omnichain-portfolio/actions/workflows/ci.yml/badge.svg)](https://github.com/Urthella/omnichain-portfolio/actions/workflows/ci.yml)

Native balances across 12 blockchains, read from public endpoints with no API keys. Every address
is checked against its chain's format and checksum before anything is sent, so a typo comes back
as an error rather than as an empty wallet. It's a small TypeScript library and command line, with
one dependency: [@noble/hashes](https://github.com/paulmillr/noble-hashes), for keccak and SHA-256.

```
$ node src/cli.ts --usd ethereum:0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 base:0x4200…0006 …
chain        address                   amount                          usd
ethereum     0xC02aaA…756Cc2   2077700.387756  ETH           4,679,750,022
base         0x420000…000006    278333.689487  ETH             626,910,452
arbitrum     0x82aF49…3fBab1    115357.541861  ETH             259,827,867
solana       So111111…111112      1862.696644  SOL                 170,940
sui          0x5                    31.018584  SUI                      27
aptos        0x1                   111.208687  APT                      68
cosmos       cosmos1j…8lyufl  26494912.961012  ATOM             37,092,878
near         wrap.near        34929416.497770  NEAR            131,683,900
starknet     0x000000…325b4b  75308630.937933  STRK              3,029,725
ton          EQCD39VS…8xqB2N   1592542.221069  TON               1,847,349
bitcoin      1A1zP1eP…DivfNa        57.700037  BTC               4,419,765
hyperliquid  0xdfc24b…0df303  10835296.390939  USDC (perps)     10,827,322
total                                                        5,755,560,314
```

Those are public contracts and accounts, read on 2026-11-03: WETH on three chains, the wrapped SOL
mint, Sui's system object, Aptos's framework account, the Cosmos Hub distribution module, wrapped
NEAR, Ekubo on Starknet, the TON Foundation's old wallet, the address in Bitcoin's genesis block, and
Hyperliquid's HLP vault.

## Chains

| Chain | Reads | Default endpoint | Checked against |
| --- | --- | --- | --- |
| ethereum | ETH | ethereum-rpc.publicnode.com | eth.drpc.org |
| base | ETH | mainnet.base.org | base-rpc.publicnode.com |
| arbitrum | ETH | arb1.arbitrum.io | arbitrum-one-rpc.publicnode.com |
| solana | SOL | api.mainnet-beta.solana.com | solana-rpc.publicnode.com |
| sui | SUI, over GraphQL | graphql.mainnet.sui.io | |
| aptos | APT, including APT held as a fungible asset | api.mainnet.aptoslabs.com | aptos-rest.publicnode.com |
| cosmos | liquid and staked ATOM | cosmos-rest.publicnode.com | rest.cosmos.directory |
| near | NEAR | rpc.mainnet.fastnear.com | rpc.mainnet.near.org |
| starknet | STRK | starknet-rpc.publicnode.com | api.cartridge.gg |
| ton | TON | toncenter.com | tonapi.io |
| bitcoin | confirmed BTC | mempool.space | blockstream.info |
| hyperliquid | spot balances and the perps account value | api.hyperliquid.xyz | |

The last column is where `npm run crosscheck` reads the same addresses again: on 2026-11-03 every
chain agreed. Sui and Hyperliquid have no second public source to compare against. Sui's public
fullnodes no longer serve JSON-RPC, which is why it uses GraphQL.

## Use it

You need Node 24, which runs the TypeScript directly.

```bash
git clone https://github.com/Urthella/omnichain-portfolio && cd omnichain-portfolio
npm install
node src/cli.ts bitcoin:1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa near:wrap.near
node src/cli.ts --usd --json solana:So11111111111111111111111111111111111111112
node src/cli.ts --endpoint ethereum=http://localhost:8545 ethereum:0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2
```

Arguments are `CHAIN:ADDRESS`, or just an address, which is looked up on every chain whose format
it fits. Some formats are shared: an EVM address is checked on Ethereum, Base, Arbitrum and
Hyperliquid, and `0x` with 64 hex digits on Sui, Aptos and Starknet.

```
$ node src/cli.ts 0xdfc24b077bc1425ad1dea75bcb6f8158e10df303 wrap.near
chain        address                   amount
ethereum     0xdfc24b…0df303         0.000151  ETH
base         0xdfc24b…0df303                0  ETH
arbitrum     0xdfc24b…0df303         0.000151  ETH
hyperliquid  0xdfc24b…0df303  10835320.777819  USDC (perps)
near         wrap.near        34929847.147615  NEAR
```

Short forms like `0x1`, NEAR names without a dot and NEAR's EVM-style accounts are too ambiguous to
guess, so those need a chain.

`--json` prints exact amounts, `--usd` adds prices from CoinGecko, and `--endpoint` points a chain
at your own node. It exits with 1 if any wallet failed, after printing the others.

From code:

```ts
import { portfolio } from "./src/portfolio.ts";

const results = await portfolio([
  { chain: "bitcoin", address: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa" },
  { chain: "cosmos", address: "cosmos1jv65s3grqf6v6jl3dp4t6c9t9rk99cd88lyufl" },
]);
// [{ chain: "bitcoin", address: "1A1z…", holdings: [{ symbol: "BTC", amount: "57.70003758" }] }, …]
```

## Address checks

| Chain | What's checked |
| --- | --- |
| EVM chains, Hyperliquid | 40 hex digits; mixed case must match the EIP-55 checksum |
| Bitcoin | base58check for `1…` and `3…`; bech32 for segwit v0 and bech32m for taproot, as BIP 350 requires; mainnet only |
| Cosmos | bech32 with the `cosmos` prefix, so an `osmo1…` address with a valid checksum is still refused |
| TON | raw `0:…` form, or the 48-character form with its CRC16; testnet addresses are refused |
| Solana | base58 that decodes to 32 bytes |
| NEAR | named accounts by NEAR's rules, 64-hex implicit accounts and `0x` EVM-style accounts |
| Starknet | a field element below 2^251 |
| Sui, Aptos | `0x` and up to 64 hex digits |

The Bitcoin test vectors come from BIP 173 and BIP 350, and the cross-check script confirms that
mempool.space's own validator agrees with every one. The EVM vectors come from EIP-55.

## How it behaves

- **Amounts are exact.** They're computed as integers and formatted as decimal strings, never as
  floats. Solana balances can pass 2^53 lamports, so they're parsed from the JSON's source text.
- **One failure doesn't hide the rest.** A wallet whose endpoint fails gets an error, and every
  other wallet still comes back.
- **It's polite to public endpoints.** Chains are queried at once, but each chain's wallets one at
  a time. A `429` waits a second and tries again, twice, and nothing waits longer than 15 seconds.
- **A missing account isn't always an error.** An unused Aptos address or NEAR implicit account
  reads as zero, while a NEAR name that doesn't exist is reported, since it's probably a typo.

## How it's tested

34 tests run against a fake `fetch`, with no network. They cover each chain's request and parsing,
the address checks, which chains a bare address goes to, exact amounts, timeouts, retries and how
wallets are queried.

To check that the tests can fail, 28 bugs were planted one at a time, and every one was caught:
among them, skipping the EIP-55 checksum, accepting taproot addresses with the older checksum,
dropping Starknet's high 128 bits, parsing lamports as a float and keeping only the last Cosmos
delegation. One more planted bug was never caught, because the check it removed didn't decide
anything, so that check was deleted.

## Limits

- **Native coins only**, plus Hyperliquid's spot tokens. No ERC-20 or SPL tokens, and no NFTs.
- **Staking:** only Cosmos delegations are counted. Solana stake accounts, NEAR staking pools,
  staked SUI and Aptos stake pools aren't.
- **Bitcoin is per address**, not per wallet descriptor, and counts confirmed outputs only.
- **Public endpoints change.** Two of the ones tried while building this had shut down. Use
  `--endpoint` with your own node if it matters.
- **USD values are approximate.** They come from CoinGecko's free API, which limits requests, and
  are multiplied as floats. Tokens it doesn't list show `?`.
- **Read only.** It never asks for a key and can't sign anything.

Claude, Anthropic's AI model, wrote this with Halil Utku Demirtaş directing the work.

## License

MIT
