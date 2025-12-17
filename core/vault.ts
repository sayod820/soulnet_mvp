import type { SoulState } from "./state";

export type EncryptedBlob = {
  v: 1;
  alg: "AES-256-GCM";
  saltB64: string; // PBKDF2 salt
  ivB64: string;   // 12 bytes
  ctB64: string;   // ciphertext
};

function b64FromBytes(bytes: Uint8Array) {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}

function bytesFromB64(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function normSeed(seed: string) {
  return (seed || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function randomBytes(n: number) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

async function deriveAesKeyFromSeed(seed: string, salt: Uint8Array) {
  const enc = new TextEncoder();

  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(normSeed(seed)),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,               // <-- ОБЯЗАТЕЛЬНО
      iterations: 210_000 // <-- ОБЯЗАТЕЛЬНО
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptSoulState(seed: string, state: SoulState): Promise<EncryptedBlob> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveAesKeyFromSeed(seed, salt);

  const json = JSON.stringify(state);
  const pt = new TextEncoder().encode(json);

  const ctBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, pt);
  const ct = new Uint8Array(ctBuf);

  return {
    v: 1,
    alg: "AES-256-GCM",
    saltB64: b64FromBytes(salt),
    ivB64: b64FromBytes(iv),
    ctB64: b64FromBytes(ct),
  };
}

export async function decryptSoulState(seed: string, blob: EncryptedBlob): Promise<SoulState> {
  if (!blob || blob.v !== 1 || blob.alg !== "AES-256-GCM") {
    throw new Error("Unsupported encrypted blob format");
  }

  const salt = bytesFromB64(blob.saltB64);
  const iv = bytesFromB64(blob.ivB64);
  const ct = bytesFromB64(blob.ctB64);

  const key = await deriveAesKeyFromSeed(seed, salt);

  const ptBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  const json = new TextDecoder().decode(new Uint8Array(ptBuf));
  return JSON.parse(json) as SoulState;
}
