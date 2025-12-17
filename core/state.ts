// core/state.ts

export type Role = "user" | "assistant";

// Ваш тип сообщения
export type ChatMsg = { role: Role; content: string; ts: number };

// Для совместимости с app/seed/page.tsx (там useState<Msg[]>)
export type Msg = ChatMsg;

export type ChatState = {
  v: 1;
  messages: ChatMsg[];
  updatedAt: number;
};

export type SoulState = {
  version: string;
  profile: { name: string; bio?: string; tone?: string };
  memory: string[];
  updatedAt: number;

  // чат (опционально)
  chat?: ChatState;
};
