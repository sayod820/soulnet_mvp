import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";

function safeId(id: string) {
  return (id || "").replace(/[^a-zA-Z0-9x_-]/g, "").slice(0, 120);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const soulAddress = safeId(searchParams.get("soulAddress") || "");

    if (!soulAddress) {
      return NextResponse.json(
        { ok: false, error: "Missing soulAddress" },
        { status: 400 }
      );
    }

    const file = path.join(process.cwd(), "data", "chain", `${soulAddress}.json`);
    const json = await fs.readFile(file, "utf-8");
    const rec = JSON.parse(json);

    return NextResponse.json({ ok: true, soulAddress, ...rec });
  } catch {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
}
