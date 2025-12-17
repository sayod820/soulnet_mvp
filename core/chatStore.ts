// core/chatStore.ts
export type ChatMsg = { role: "user" | "assistant"; content: string; ts: number };

const PREFIX = "soulnet:chat:";

function safeLS() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function keyFor(addr: string) {
  return `${PREFIX}${String(addr || "").toLowerCase()}`;
}

export function loadChat(addr: string): ChatMsg[] {
  const ls = safeLS();
  if (!ls || !addr) return [];

  const raw = ls.getItem(keyFor(addr));
  if (!raw) return [];

  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (x) =>
          x &&
          (x.role === "user" || x.role === "assistant") &&
          typeof x.content === "string"
      )
      .map((x) => ({
        role: x.role,
        content: x.content,
        ts: typeof x.ts === "number" ? x.ts : Date.now(),
      }));
  } catch {
    return [];
  }
}

export function saveChat(addr: string, msgs: ChatMsg[]) {
  const ls = safeLS();
  if (!ls || !addr) return;
  ls.setItem(keyFor(addr), JSON.stringify(msgs));
}

export function wipeChat(addr: string) {
  const ls = safeLS();
  if (!ls || !addr) return;
  ls.removeItem(keyFor(addr));
}
