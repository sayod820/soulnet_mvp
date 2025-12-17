import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";

function safeId(id: string) {
  return (id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 120);
}

function getSnapshotsDir() {
  const root = process.env.VERCEL ? "/tmp/soulnet-data" : path.join(process.cwd(), "data");
  return path.join(root, "snapshots");
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ cid: string }> }
) {
  try {
    const { cid } = await ctx.params; // params это Promise
    const safeCid = safeId(cid);

    const file = path.join(getSnapshotsDir(), `${safeCid}.json`);
    const json = await fs.readFile(file, "utf-8");

    // возвращаем ЧИСТЫЙ blob (то, что ожидает decrypt)
    return NextResponse.json(JSON.parse(json));
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
