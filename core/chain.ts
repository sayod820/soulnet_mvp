export async function commitCID(soulAddress: string, cid: string) {
  const res = await fetch("/api/chain/commit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ soulAddress, cid }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Chain commit failed: ${res.status} ${text}`);
  }

  return res.json() as Promise<{ ok: true; cid: string; ts: number; soulAddress: string }>;
}

export async function getLastCIDFromChain(soulAddress: string) {
  const res = await fetch(`/api/chain/last?soulAddress=${encodeURIComponent(soulAddress)}`);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Chain lastCID not found: ${res.status} ${text}`);
  }

  return res.json() as Promise<{ cid: string; ts: number }>;
}
