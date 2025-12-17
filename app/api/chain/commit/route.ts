import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";

function safeId(id: string) {
  return (id || "").replace(/[^a-zA-Z0-9x_-]/g, "").slice(0, 120);
}

type Record = { cid: string; ts: number };

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const soulAddress = safeId(body?.soulAddress);
    const cid = safeId(body?.cid);

    if (!soulAddress || !cid) {
      return NextResponse.json(
        { ok: false, error: "Missing soulAddress or cid" },
        { status: 400 }
      );
    }

    const dir = path.join(process.cwd(), "data", "chain");
    await fs.mkdir(dir, { recursive: true });

    const file = path.join(dir, `${soulAddress}.json`);
    const rec: Record = { cid, ts: Date.now() };

    await fs.writeFile(file, JSON.stringify(rec, null, 2), "utf-8");
    return NextResponse.json({ ok: true, soulAddress, ...rec });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Commit failed" },
      { status: 500 }
    );
  }
}
