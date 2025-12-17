import type { EncryptedBlob } from "@/core/vault";

function isEncryptedBlob(x: any): x is EncryptedBlob {
  return (
    x &&
    typeof x === "object" &&
    (x.v === 1 || x.v === "1") &&
    typeof x.alg === "string" &&
    typeof x.saltB64 === "string" &&
    typeof x.ivB64 === "string" &&
    typeof x.ctB64 === "string"
  );
}

export async function uploadSnapshot(blob: EncryptedBlob): Promise<string> {
  // 1) проверка на клиенте (чтобы сразу видеть проблему)
  if (!isEncryptedBlob(blob)) {
    console.error("uploadSnapshot(): bad blob:", blob);
    throw new Error("Missing blob");
  }

  // 2) отправляем в стабильном формате: { snapshot: blob }
  const res = await fetch("/api/snapshots/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ snapshot: blob }),
  });

  const data = await res.json().catch(() => ({} as any));
  if (!res.ok) throw new Error(data?.error || `Upload failed (${res.status})`);

  const cid = data?.cid || data?.id;
  if (!cid) throw new Error("Upload ok, but CID missing");
  return cid;
}

export async function downloadSnapshot(cid: string): Promise<EncryptedBlob> {
  const res = await fetch(`/api/snapshots/${encodeURIComponent(cid)}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  const data = await res.json().catch(() => ({} as any));
  if (!res.ok) throw new Error(data?.error || `Download failed (${res.status})`);

  // поддерживаем оба формата ответа
  const blob = data?.snapshot ?? data;

  if (!isEncryptedBlob(blob)) {
    console.error("downloadSnapshot(): bad format:", data);
    throw new Error("Unsupported encrypted blob format");
  }

  return blob;
}
