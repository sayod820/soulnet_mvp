export type ChatMsg = { role: "user" | "assistant"; content: string };
export type ChatPayload = {
  messages: ChatMsg[];
  soul?: any;
};

export type ChatResult = {
  message: { role: "assistant"; content: string };
};

export async function chat(payload: ChatPayload): Promise<ChatResult> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({} as any));
  if (!res.ok) throw new Error(data?.error || `Chat failed (${res.status})`);
  return data as ChatResult;
}
