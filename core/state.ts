export type ChatMsg = { role: "user" | "assistant"; content: string; ts: number };

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

  // ВАЖНО: добавляем
  chat?: ChatState;
};
