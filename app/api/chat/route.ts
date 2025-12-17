import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ChatMsg = { role: "user" | "assistant" | "system"; content: string };
type ChatPayload = { messages: ChatMsg[]; soul?: any };

function buildSystemPrompt(soul: any) {
  const name = soul?.profile?.name ?? "Digital Soul";
  const tone = soul?.profile?.tone ?? "calm";
  const bio = soul?.profile?.bio ?? "";
  const memory = Array.isArray(soul?.memory) ? soul.memory : [];

  const memBlock = memory.length ? `\nMemory:\n- ${memory.join("\n- ")}\n` : "\n";

  return [
    `You are "${name}" — the user's Digital Soul.`,
    `Tone: ${tone}.`,
    bio ? `Bio: ${bio}` : "",
    memBlock.trim(),
    `Rules:`,
    `- Stay consistent with the Soul profile and memory.`,
    `- Be helpful, concise, and natural.`,
    `- If the user asks for private keys/passwords: refuse.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function POST(req: Request) {
  try {
    const key = process.env.OPENROUTER_API_KEY;
    const model = process.env.OPENROUTER_MODEL || "deepseek/deepseek-chat";
    const siteUrl = process.env.OPENROUTER_SITE_URL || "http://localhost:3000";
    const appName = process.env.OPENROUTER_APP_NAME || "SoulNet MVP";

    if (!key) {
      return NextResponse.json(
        { error: "Missing OPENROUTER_API_KEY in .env.local" },
        { status: 500 }
      );
    }

    const body = (await req.json()) as ChatPayload;
    const userMessages = Array.isArray(body?.messages) ? body.messages : [];

    // prepend system message built from SoulState
    const system: ChatMsg = {
      role: "system",
      content: buildSystemPrompt(body?.soul),
    };

    const messages: ChatMsg[] = [system, ...userMessages]
      .filter((m) => m?.role && typeof m?.content === "string")
      .map((m) => ({ role: m.role, content: m.content }));

    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": siteUrl, // optional :contentReference[oaicite:2]{index=2}
        "X-Title": appName,      // optional :contentReference[oaicite:3]{index=3}
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    const data = await r.json().catch(() => ({} as any));
    if (!r.ok) {
      const msg = data?.error?.message || data?.error || `OpenRouter error (${r.status})`;
      return NextResponse.json({ error: msg, raw: data }, { status: 500 });
    }

    const content =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.delta?.content ??
      "";

    return NextResponse.json({
      message: { role: "assistant", content: String(content || "").trim() || "(empty response)" },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
