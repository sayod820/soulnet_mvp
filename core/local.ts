import type { EncryptedBlob } from "./vault";

const K = {
  activeSoul: "soulnet:activeSoulAddress",
  lastCid: "soulnet:lastCID",
  lastSnapshot: "soulnet:lastEncryptedSnapshot",
} as const;

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function setActiveSoulAddress(addr: string) {
  const s = storage();
  if (!s) return;
  s.setItem(K.activeSoul, addr);
}
export function getActiveSoulAddress(): string | null {
  const s = storage();
  if (!s) return null;
  return s.getItem(K.activeSoul);
}

export function setLastCID(cid: string) {
  const s = storage();
  if (!s) return;
  s.setItem(K.lastCid, cid);
}
export function getLastCID(): string | null {
  const s = storage();
  if (!s) return null;
  return s.getItem(K.lastCid);
}

export function saveEncryptedSnapshot(blob: EncryptedBlob) {
  const s = storage();
  if (!s) return;
  s.setItem(K.lastSnapshot, JSON.stringify(blob));
}
export function loadEncryptedSnapshot(): EncryptedBlob | null {
  const s = storage();
  if (!s) return null;

  const raw = s.getItem(K.lastSnapshot);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as EncryptedBlob;
  } catch {
    return null;
  }
}

export function wipeLocal() {
  const s = storage();
  if (!s) return;
  s.removeItem(K.activeSoul);
  s.removeItem(K.lastCid);
  s.removeItem(K.lastSnapshot);
}



