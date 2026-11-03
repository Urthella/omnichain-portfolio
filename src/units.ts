/** Formats an integer number of base units as an exact decimal string. */
export function formatUnits(raw: bigint, decimals: number): string {
  const sign = raw < 0n ? "-" : "";
  const abs = raw < 0n ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const fraction = (abs % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return sign + (abs / base).toString() + (fraction ? "." + fraction : "");
}

/** Checks a decimal string from an API and drops trailing zeros, without going through a float. */
export function normalizeDecimal(text: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) throw new Error(`not a decimal number: ${text}`);
  const whole = match[2].replace(/^0+(?=\d)/, "");
  const fraction = (match[3] ?? "").replace(/0+$/, "");
  const sign = match[1] && (whole !== "0" || fraction) ? "-" : "";
  return sign + whole + (fraction ? "." + fraction : "");
}
