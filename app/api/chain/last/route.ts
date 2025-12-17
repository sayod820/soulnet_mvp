import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";

function safeSoulAddress(raw: string) {
  const v = (raw || "").trim().toLowerCase();
  // ожидаем 0x + 40 hex
  if (!/^0x[0-9a-f]{40}$/.test(v)) return "";
  return v;
}

function getChainDir() {
  const root = process.env.VERCEL ? "/tmp/soulnet-data" : path.join(process.cwd(), "data");
  return path.join(root, "chain");
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const soulAddress = safeSoulAddress(searchParams.get("soulAddress") || "");

  if (!soulAddress) {
    return NextResponse.json(
      { error: "Missing/invalid soulAddress" },
      { status: 400 }
    );
  }

  try {
    const file = path.join(getChainDir(), `${soulAddress}.json`);
    const json = await fs.readFile(file, "utf-8");
    const rec = JSON.parse(json) as { cid: string; ts: number };

    return NextResponse.json({ ok: true, soulAddress, ...rec });
  } catch {
    // важно: возвращаем soulAddress для дебага
    return NextResponse.json({ error: "Not found", soulAddress }, { status: 404 });
  }
}
