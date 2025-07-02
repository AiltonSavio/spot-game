import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatSui(mist: number | string, decimals = 2) {
  const num = typeof mist === "string" ? parseInt(mist, 10) : mist;
  return (num / 1e9).toFixed(decimals);
}

export function formatNumber(num: number, decimals = 2) {
  if (num === 0) return "0";
  if (num < 0.0001) return num?.toExponential(2);
  return num?.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

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

export function utf8ToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}