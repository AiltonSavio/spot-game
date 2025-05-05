export function hexToBytes(hex: string): number[] {
  // strip any leading 0x
  hex = hex.startsWith("0x") ? hex.slice(2) : hex;
  // split into pairs, parse as hex
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return bytes;
}
