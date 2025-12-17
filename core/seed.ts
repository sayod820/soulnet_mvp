import * as bip39 from "bip39";

export async function generateSeed(): Promise<string> {
  // 256-bit entropy => 24 words
  return bip39.generateMnemonic(256);
}

export function validateSeed(seed: string): boolean {
  return bip39.validateMnemonic((seed || "").trim());
}
