// Address checks for each chain, including checksums, so a mistyped address is caught before any
// request instead of coming back as an empty balance.

import { sha256 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";

/** EVM addresses. Mixed case must match the EIP-55 checksum; all lower or upper case has none. */
export function isEvmAddress(address: string): boolean {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return false;
  const hex = address.slice(2);
  if (hex === hex.toLowerCase() || hex === hex.toUpperCase()) return true;
  const hash = keccak_256(new TextEncoder().encode(hex.toLowerCase()));
  for (let i = 0; i < 40; i++) {
    const nibble = (hash[i >> 1] >> (i % 2 === 0 ? 4 : 0)) & 0xf;
    const upper = hex[i] !== hex[i].toLowerCase();
    if (/[a-fA-F]/.test(hex[i]) && upper !== nibble >= 8) return false;
  }
  return true;
}

/** Sui and Aptos: 0x and up to 32 bytes of hex. */
export function isMoveAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{1,64}$/.test(address);
}

/** Starknet: a field element below 2^251. */
export function isStarknetAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{1,64}$/.test(address) && BigInt(address) < 2n ** 251n;
}

export function isSolanaAddress(address: string): boolean {
  return address.length >= 32 && address.length <= 44 && base58Decode(address)?.length === 32;
}

/** Named accounts like `wrap.near`, and implicit accounts: 64 hex characters, or an EVM address. */
export function isNearAccount(address: string): boolean {
  if (isNearImplicit(address)) return true;
  return (
    address.length >= 2 &&
    address.length <= 64 &&
    /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(address)
  );
}

export function isNearImplicit(address: string): boolean {
  return /^[0-9a-f]{64}$/.test(address) || /^0x[0-9a-f]{40}$/.test(address);
}

/** Cosmos Hub accounts: bech32 with the `cosmos` prefix. */
export function isCosmosAddress(address: string): boolean {
  const decoded = bech32Decode(address);
  if (!decoded || decoded.hrp !== "cosmos" || decoded.spec !== BECH32) return false;
  const bytes = convertBits(decoded.data, 5, 8);
  return bytes?.length === 20 || bytes?.length === 32;
}

/** Bitcoin mainnet: legacy and P2SH addresses in base58check, and segwit and taproot in bech32(m). */
export function isBitcoinAddress(address: string): boolean {
  if (/^[13]/.test(address)) {
    const bytes = base58Decode(address);
    if (bytes?.length !== 25 || (bytes[0] !== 0x00 && bytes[0] !== 0x05)) return false;
    const check = sha256(sha256(bytes.subarray(0, 21)));
    return check.subarray(0, 4).every((b, i) => b === bytes[21 + i]);
  }
  const decoded = bech32Decode(address);
  if (!decoded || decoded.hrp !== "bc" || decoded.data.length === 0) return false;
  const [version, ...rest] = decoded.data;
  const program = convertBits(rest, 5, 8);
  if (!program || version > 16 || program.length < 2 || program.length > 40) return false;
  // BIP 350: version 0 uses bech32, later versions bech32m.
  if (version === 0) return decoded.spec === BECH32 && (program.length === 20 || program.length === 32);
  return decoded.spec === BECH32M;
}

/** TON: raw `workchain:hex`, or the 48-character form with its CRC16. Mainnet only. */
export function isTonAddress(address: string): boolean {
  if (/^(0|-1):[0-9a-fA-F]{64}$/.test(address)) return true;
  if (!/^[A-Za-z0-9+/_-]{48}$/.test(address)) return false;
  const bytes = Uint8Array.from(atob(address.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  const [tag, workchain] = bytes;
  // 0x11 is bounceable and 0x51 isn't; the testnet flag (0x80) is refused.
  if ((tag !== 0x11 && tag !== 0x51) || (workchain !== 0x00 && workchain !== 0xff)) return false;
  return crc16(bytes.subarray(0, 34)) === ((bytes[34] << 8) | bytes[35]);
}

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Decode(text: string): Uint8Array | undefined {
  let n = 0n;
  for (const c of text) {
    const digit = BASE58.indexOf(c);
    if (digit < 0) return undefined;
    n = n * 58n + BigInt(digit);
  }
  const bytes: number[] = [];
  for (; n > 0n; n /= 256n) bytes.unshift(Number(n % 256n));
  for (let i = 0; text[i] === "1"; i++) bytes.unshift(0);
  return Uint8Array.from(bytes);
}

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH32 = 1;
const BECH32M = 0x2bc830a3;

/** `spec` is what the checksum works out to: BECH32 or BECH32M if it's valid. Callers check it. */
function bech32Decode(text: string): { hrp: string; data: number[]; spec: number } | undefined {
  if (text !== text.toLowerCase() && text !== text.toUpperCase()) return undefined;
  const lower = text.toLowerCase();
  const sep = lower.lastIndexOf("1");
  if (sep < 1 || sep + 7 > lower.length || lower.length > 90) return undefined;
  const hrp = lower.slice(0, sep);
  const data = [...lower.slice(sep + 1)].map((c) => CHARSET.indexOf(c));
  if (data.includes(-1)) return undefined;
  const codes = [...hrp].map((c) => c.charCodeAt(0));
  const spec = polymod([...codes.map((c) => c >> 5), 0, ...codes.map((c) => c & 31), ...data]);
  return { hrp, data: data.slice(0, -6), spec };
}

function polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GEN[i];
  }
  return chk >>> 0;
}

/** Regroups bits without padding, failing if the leftover bits aren't zero padding. */
function convertBits(data: number[], from: number, to: number): number[] | undefined {
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  const maxAcc = (1 << (from + to - 1)) - 1;
  for (const value of data) {
    acc = ((acc << from) | value) & maxAcc;
    bits += from;
    for (; bits >= to; bits -= to) out.push((acc >> (bits - to)) & ((1 << to) - 1));
  }
  if (bits >= from || (acc << (to - bits)) & ((1 << to) - 1)) return undefined;
  return out;
}

/** CRC16-XMODEM, as TON addresses use it. */
function crc16(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = (crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1) & 0xffff;
  }
  return crc;
}
