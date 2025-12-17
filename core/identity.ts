import * as bip39 from "bip39";

function hexFromBytes(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(data: Uint8Array) {
  // Делает копию в новый Uint8Array с обычным ArrayBuffer
  const bytes = new Uint8Array(data);

  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(digest);
}


/**
 * Детерминированный "адрес души" из seed.
 * Важно: это MVP-адрес. Позже можно заменить на полноценный (например, ed25519/secp256k1).
 */
export async function seedToSoulAddress(seed: string): Promise<string> {
  const s = (seed || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!bip39.validateMnemonic(s)) throw new Error("Invalid seed phrase");

  // entropy (hex) -> bytes
  const entropyHex = bip39.mnemonicToEntropy(s);
  const entropyBytes = Uint8Array.from(
    entropyHex.match(/.{1,2}/g)!.map((x) => parseInt(x, 16))
  );

  // address = sha256(entropy) first 20 bytes
  const h = await sha256(entropyBytes);
  const addr20 = h.slice(0, 20);

  return "0x" + hexFromBytes(addr20);
}
