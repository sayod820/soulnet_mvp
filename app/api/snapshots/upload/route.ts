import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

export const runtime = "nodejs";

type EncryptedBlob = {
  v: number;
  alg: string;
  saltB64: string;
  ivB64: string;
  ctB64: string;
};

function isEncryptedBlob(x: any): x is EncryptedBlob {
  return (
    x &&
    typeof x === "object" &&
    typeof x.v !== "undefined" &&
    typeof x.alg === "string" &&
    typeof x.saltB64 === "string" &&
    typeof x.ivB64 === "string" &&
    typeof x.ctB64 === "string"
  );
}

function newCid() {
  return `cid_${crypto.randomBytes(16).toString("hex")}`;
}

function getSnapshotsDir() {
  const root = process.env.VERCEL ? "/tmp/soulnet-data" : path.join(process.cwd(), "data");
  return path.join(root, "snapshots");
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    // принимаем и {snapshot: blob}, и {blob: blob}, и просто blob
    const blob = body?.snapshot ?? body?.blob ?? body;

    if (!isEncryptedBlob(blob)) {
      return NextResponse.json({ error: "Missing blob" }, { status: 400 });
    }

    const dir = getSnapshotsDir();
    await fs.mkdir(dir, { recursive: true });

    const cid = newCid();
    const file = path.join(dir, `${cid}.json`);

    // сохраняем ТОЛЬКО blob, без обёрток
    await fs.writeFile(file, JSON.stringify(blob, null, 2), "utf-8");

    return NextResponse.json({ ok: true, cid });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Upload failed" },
      { status: 500 }
    );
  }
}
