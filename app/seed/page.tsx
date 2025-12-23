"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { generateSeed, validateSeed } from "@/core/seed";
import { seedToSoulAddress } from "@/core/identity";
import type { SoulState } from "@/core/state";
import type { EncryptedBlob } from "@/core/vault";
import { encryptSoulState, decryptSoulState } from "@/core/vault";

import {
  setActiveSoulAddress,
  getActiveSoulAddress,
  saveEncryptedSnapshot,
  loadEncryptedSnapshot,
  wipeLocal,
  setLastCID,
  getLastCID,
} from "@/core/local";

import { uploadSnapshot, downloadSnapshot } from "@/core/ipfs";
import { commitCID, getLastCIDFromChain } from "@/core/chain";
import { chat } from "@/core/chat";

// ===== Types (fix build: no Msg import needed) =====
type Msg = { role: "user" | "assistant"; content: string; ts: number };

type Tab =
  | "architecture"
  | "identity"
  | "chat"
  | "protocol"
  | "registry"
  | "security";

const SESSION_SEED_KEY = "soulnet:seed:session";
const SESSION_TAB_KEY = "soulnet:tab:session";

function nowTs() {
  return Date.now();
}
function safeSessionGet(key: string) {
  try {
    return sessionStorage.getItem(key) || "";
  } catch {
    return "";
  }
}
function safeSessionSet(key: string, val: string) {
  try {
    sessionStorage.setItem(key, val);
  } catch {}
}

function shortAddr(a?: string | null) {
  if (!a) return "null";
  return a.slice(0, 10) + "...";
}

export default function SeedPage() {
  const [mounted, setMounted] = useState(false);

  // tab
  const [tab, setTab] = useState<Tab>("architecture");

  // seed/address
  const [seedShown, setSeedShown] = useState("");
  const [seedInput, setSeedInput] = useState("");
  const [addr, setAddr] = useState("");

  // snapshot/soul
  const [enc, setEnc] = useState<EncryptedBlob | null>(null);
  const [soul, setSoul] = useState<SoulState | null>(null);

  // CID
  const [cid, setCid] = useState<string>("");

  // chat
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Welcome. Click “Load Soul” to start chatting.", ts: nowTs() },
  ]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingSoul, setLoadingSoul] = useState(false);

  // ui info/errors
  const [localInfo, setLocalInfo] = useState("loading…");
  const [err, setErr] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const seedOk = useMemo(() => validateSeed(seedInput.trim()), [seedInput]);

  function refreshLocalInfo() {
    const a = getActiveSoulAddress();
    const snap = loadEncryptedSnapshot();
    const last = getLastCID();
    setLocalInfo(
      `activeSoul=${shortAddr(a)} | snapshot=${snap ? "yes" : "no"} | cid=${last ?? "null"}`
    );
  }

  function setError(e: any, fallback: string) {
    setErr(e?.message || fallback);
  }

  // ===== Init =====
  useEffect(() => {
    setMounted(true);

    const s = safeSessionGet(SESSION_SEED_KEY);
    if (s) setSeedInput(s);

    const t = safeSessionGet(SESSION_TAB_KEY) as Tab;
    if (
      t === "architecture" ||
      t === "identity" ||
      t === "chat" ||
      t === "protocol" ||
      t === "registry" ||
      t === "security"
    ) {
      setTab(t);
    }

    const last = getLastCID();
    if (last) setCid(last);

    const snap = loadEncryptedSnapshot();
    if (snap) setEnc(snap);

    const a = getActiveSoulAddress();
    if (a) setAddr(a);

    refreshLocalInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep tab in session
  useEffect(() => {
    if (!mounted) return;
    safeSessionSet(SESSION_TAB_KEY, tab);
  }, [mounted, tab]);

  // autoscroll chat
  useEffect(() => {
    if (tab !== "chat") return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, tab]);

  // auto restore chat when open tab chat
  useEffect(() => {
    if (!mounted) return;
    if (tab !== "chat") return;
    if (soul || loadingSoul) return;

    const s = seedInput.trim();
    if (!validateSeed(s)) return;

    const snap = loadEncryptedSnapshot();
    if (!snap) return;

    onLoadSoulForChat(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, tab]);

  // ===== Actions =====
  async function onCreateSeed() {
    setErr("");
    setSoul(null);
    setSeedShown("");

    const s = await generateSeed();
    setSeedShown(s);
    setSeedInput(s);
    safeSessionSet(SESSION_SEED_KEY, s);

    const a = await seedToSoulAddress(s);
    setAddr(a);
    setActiveSoulAddress(a);

    const empty: SoulState = {
      version: "mvp-1",
      profile: { name: "SoulNet Demo", bio: "Encrypted identity", tone: "calm" },
      memory: [],
      chat: { v: 1, messages: [], updatedAt: nowTs() },
      updatedAt: nowTs(),
    };

    const blob = await encryptSoulState(s, empty);
    setEnc(blob);
    saveEncryptedSnapshot(blob);

    refreshLocalInfo();
    setTab("identity");
  }

  async function onRestoreFromSeed() {
    setErr("");
    setSeedShown("");
    setSoul(null);

    const s = seedInput.trim();
    if (!validateSeed(s)) return setErr("Invalid seed phrase (expected 24 words).");

    safeSessionSet(SESSION_SEED_KEY, s);

    const a = await seedToSoulAddress(s);
    setAddr(a);
    setActiveSoulAddress(a);

    refreshLocalInfo();
    setTab("identity");
  }

  async function onLoadSoulForChat(silent = false) {
    if (!silent) setErr("");
    setLoadingSoul(true);

    try {
      const s = seedInput.trim();
      if (!validateSeed(s)) throw new Error('Go to “Identity (Seed)” and paste your 24-word seed first.');

      const snap = loadEncryptedSnapshot();
      if (!snap) throw new Error("No local snapshot found. Create seed first.");

      const st = await decryptSoulState(s, snap);
      setSoul(st);
      setEnc(snap);

      const restored: Msg[] = (st.chat?.messages ?? []).map((m: any) => ({
        role: m.role,
        content: m.content,
        ts: m.ts ?? nowTs(),
      }));

      if (restored.length) {
        setMessages(restored);
      } else {
        setMessages([
          {
            role: "assistant",
            content: `Hello. I am your Digital Soul. profile="${st.profile?.name}", tone="${st.profile?.tone}".`,
            ts: nowTs(),
          },
        ]);
      }

      refreshLocalInfo();
    } catch (e: any) {
      if (!silent) setError(e, "Load Soul failed");
    } finally {
      setLoadingSoul(false);
    }
  }

  async function autosaveChat(nextMessages: Msg[]) {
    const s = seedInput.trim();
    if (!validateSeed(s)) return;
    if (!soul) return;

    const updated: SoulState = {
      ...soul,
      chat: { v: 1, messages: nextMessages as any, updatedAt: nowTs() },
      updatedAt: nowTs(),
    };

    const blob = await encryptSoulState(s, updated);
    setEnc(blob);
    setSoul(updated);
    saveEncryptedSnapshot(blob);
    refreshLocalInfo();
  }

  async function onSend() {
    setErr("");
    const t = text.trim();
    if (!t) return;

    if (!soul) {
      setErr('Click "Load Soul" first.');
      return;
    }

    setText("");
    setSending(true);

    const nextUser: Msg = { role: "user", content: t, ts: nowTs() };
    const base = [...messages, nextUser];
    setMessages(base);

    try {
      const r = await chat({
        messages: base.map((x) => ({ role: x.role, content: x.content })),
        soul,
      });

      const nextAssistant: Msg = { role: "assistant", content: r.message.content, ts: nowTs() };
      const nextAll = [...base, nextAssistant];
      setMessages(nextAll);

      await autosaveChat(nextAll);
    } catch (e: any) {
      setError(e, "Send failed");
    } finally {
      setSending(false);
    }
  }

  async function onBackupToCID() {
    setErr("");
    try {
      const snap = loadEncryptedSnapshot();
      if (!snap) return setErr("No snapshot to backup. Create seed first.");
      const newCid = await uploadSnapshot(snap);
      setCid(newCid);
      setLastCID(newCid);
      refreshLocalInfo();
    } catch (e: any) {
      setError(e, "Backup failed");
    }
  }

  async function onRestoreFromCID() {
    setErr("");
    try {
      const useCid = cid || getLastCID();
      if (!useCid) return setErr("CID not found.");
      const snap = await downloadSnapshot(useCid);
      setEnc(snap);
      saveEncryptedSnapshot(snap);
      setLastCID(useCid);
      setCid(useCid);
      refreshLocalInfo();
    } catch (e: any) {
      setError(e, "Restore from CID failed");
    }
  }

  async function onCommitToChain() {
    setErr("");
    try {
      const a = addr || getActiveSoulAddress();
      if (!a) return setErr("No soulAddress.");
      const useCid = cid || getLastCID();
      if (!useCid) return setErr("No CID.");
      await commitCID(a, useCid);
    } catch (e: any) {
      setError(e, "Commit to chain failed");
    }
  }

  async function onRestoreViaChain() {
    setErr("");
    try {
      const s = seedInput.trim();
      if (!validateSeed(s)) return setErr("Invalid seed.");

      const a = await seedToSoulAddress(s);
      const last = await getLastCIDFromChain(a);
      const chainCid = last?.cid;
      if (!chainCid) return setErr("Chain returned no CID.");

      setCid(chainCid);
      setLastCID(chainCid);

      const snap = await downloadSnapshot(chainCid);
      setEnc(snap);
      saveEncryptedSnapshot(snap);

      setAddr(a);
      setActiveSoulAddress(a);
      refreshLocalInfo();
    } catch (e: any) {
      setError(e, "Restore via chain failed");
    }
  }

  function onWipeLocal() {
    wipeLocal();
    setEnc(null);
    setSoul(null);
    setAddr("");
    setCid("");
    setSeedShown("");
    setMessages([{ role: "assistant", content: "Welcome. Click “Load Soul” to start chatting.", ts: nowTs() }]);
    setErr("");
    refreshLocalInfo();
    setTab("architecture");
  }

  const localInfoText = mounted ? localInfo : "loading…";

  // ===== UI helpers =====
  const TabBtn = ({
    id,
    label,
  }: {
    id: Tab;
    label: string;
  }) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={[
        "rounded-lg border px-3 py-2 text-xs font-medium transition",
        tab === id
          ? "border-zinc-200 bg-zinc-100 text-zinc-900"
          : "border-zinc-700 text-zinc-200 hover:bg-zinc-900/40",
      ].join(" ")}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl p-6 space-y-4">
        <div className="text-xs text-zinc-400 text-center">
          SoulNet v3.2 • Architectural Demonstrator • One Screen
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
          <div className="p-5 space-y-3">
            <div className="text-lg font-semibold">SoulNet — Non-Custodial AI Identity</div>

            <div className="flex flex-wrap gap-2">
              <TabBtn id="architecture" label="Architecture" />
              <TabBtn id="identity" label="Identity (Seed)" />
              <TabBtn id="chat" label="SoulCore (Chat)" />
              <TabBtn id="protocol" label="Soul Protocol (CID)" />
              <TabBtn id="registry" label="Registry (Chain-Agnostic)" />
              <TabBtn id="security" label="Security (Zero-Access)" />
              <button
                type="button"
                onClick={onWipeLocal}
                className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-900/40"
              >
                Wipe local
              </button>
            </div>

            <div className="text-xs text-zinc-500">Local: {localInfoText}</div>

            {/* ===== CONTENT CARD ===== */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-5">
              {/* Architecture */}
              {tab === "architecture" ? (
                <div className="space-y-3">
                  <div className="text-sm font-semibold">Architecture Proof Map</div>
                  <div className="text-xs text-zinc-400">
                    This demonstrator proves 5 core properties of SoulNet v3.2:
                  </div>
                  <ul className="list-disc pl-5 text-xs text-zinc-300 space-y-1">
                    <li>
                      <b>Non-custodial ownership:</b> seed = sole access key (no accounts, no recovery by operator).
                    </li>
                    <li>
                      <b>Recovery-first protocol:</b> encrypted snapshot → CID → restore on any device.
                    </li>
                    <li>
                      <b>Chain-agnostic registry:</b> registry stores references (CID), not data; chain is replaceable.
                    </li>
                    <li>
                      <b>Zero-access security:</b> platform cannot decrypt, reset, or clone a soul.
                    </li>
                    <li>
                      <b>Layer separation:</b> SoulCore is UI-independent (chat is only a demo UI).
                    </li>
                  </ul>

                  <div className="pt-2 text-xs text-zinc-400">
                    Recommended 3-minute demo flow:
                  </div>
                  <ol className="list-decimal pl-5 text-xs text-zinc-300 space-y-1">
                    <li>Identity (Seed): create seed → get soul_address</li>
                    <li>SoulCore (Chat): Load Soul → send message → auto-save encrypted snapshot</li>
                    <li>Soul Protocol (CID): Backup → CID → Restore ← CID</li>
                    <li>Registry: Commit CID → Chain → Restore via Chain</li>
                    <li>Security: show “zero-access” model and responsibility</li>
                  </ol>
                </div>
              ) : null}

              {/* Identity */}
              {tab === "identity" ? (
                <div className="space-y-4">
                  <div className="text-sm font-semibold">Identity & Ownership (Seed-based)</div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={onCreateSeed}
                      className="rounded-lg bg-zinc-100 text-zinc-900 px-4 py-2 text-xs font-semibold"
                    >
                      Create seed
                    </button>
                    <button
                      type="button"
                      onClick={onRestoreFromSeed}
                      className="rounded-lg border border-zinc-700 px-4 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-900/40"
                    >
                      Restore from seed
                    </button>
                  </div>

                  <div className="text-xs text-zinc-400">
                    Ownership rule: This seed represents sole cryptographic ownership of the Digital Soul.
                    SoulNet never receives, stores, or can recover this seed. Loss of seed = loss of access by design.
                  </div>
                  <div className="text-xs text-zinc-500">
                    Demo note: seed is never sent to any server. For demo convenience only, it may be cached in this tab session (sessionStorage).
                  </div>

                  <textarea
                    value={seedInput}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSeedInput(v);
                      safeSessionSet(SESSION_SEED_KEY, v);
                    }}
                    placeholder="Paste your 24-word seed here…"
                    rows={4}
                    className="w-full rounded-xl bg-zinc-950 border border-zinc-800 p-3 text-xs outline-none"
                  />

                  {seedShown ? (
                    <div className="text-xs text-zinc-400 break-words">
                      <div className="font-semibold text-zinc-300 mb-1">Generated seed (copy & store safely):</div>
                      {seedShown}
                    </div>
                  ) : null}

                  {addr ? (
                    <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-3">
                      <div className="text-[11px] text-emerald-200/90">soul_address</div>
                      <div className="font-mono text-xs break-all">{addr}</div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* Chat */}
              {tab === "chat" ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">Digital Soul (Chat)</div>
                    <div className="text-xs text-zinc-500">
                      Seed: {seedOk ? "ok" : "missing"} • Auto-save: on
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onLoadSoulForChat(false)}
                      disabled={!seedOk || loadingSoul}
                      className="rounded-lg border border-zinc-700 px-4 py-2 text-xs font-semibold disabled:opacity-50 hover:bg-zinc-900/40"
                    >
                      {loadingSoul ? "Loading…" : "Load Soul"}
                    </button>

                    <button
                      type="button"
                      onClick={() => setTab("identity")}
                      className="rounded-lg border border-zinc-700 px-4 py-2 text-xs font-semibold hover:bg-zinc-900/40"
                    >
                      Back to Seed
                    </button>
                  </div>

                  {!seedOk ? (
                    <div className="text-xs text-zinc-500">
                      Go to “Identity (Seed)” and paste/restore your 24-word seed to unlock chat decryption.
                    </div>
                  ) : null}

                  <div
                    ref={listRef}
                    className="h-[420px] overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 p-3 space-y-3"
                  >
                    {messages.map((m, i) => (
                      <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
                        <div
                          className={[
                            "inline-block max-w-[92%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-xs",
                            m.role === "user"
                              ? "bg-emerald-600/20 border border-emerald-900/60"
                              : "bg-zinc-900/50 border border-zinc-800",
                          ].join(" ")}
                        >
                          {m.content}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <input
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") onSend();
                      }}
                      placeholder="Type a message…"
                      className="flex-1 rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 text-xs outline-none"
                    />
                    <button
                      type="button"
                      onClick={onSend}
                      disabled={sending}
                      className="rounded-xl bg-zinc-100 text-zinc-900 px-4 py-2 text-xs font-semibold disabled:opacity-50"
                    >
                      {sending ? "Sending…" : "Send"}
                    </button>
                  </div>

                  <div className="text-[11px] text-zinc-500">
                    Messages are auto-saved into the encrypted snapshot. Refresh (F5) keeps seed in session + auto-restores chat.
                  </div>
                </div>
              ) : null}

              {/* Protocol (CID) */}
              {tab === "protocol" ? (
                <div className="space-y-4">
                  <div className="text-sm font-semibold">Soul Protocol (Recovery-First) — Snapshot → CID → Restore</div>

                  <ol className="list-decimal pl-5 text-xs text-zinc-300 space-y-1">
                    <li>Local encrypted snapshot is created</li>
                    <li>Snapshot is uploaded to decentralized storage (IPFS)</li>
                    <li>CID represents the soul state reference</li>
                    <li>Soul can be restored on any device using seed + CID</li>
                  </ol>

                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                    <div className="text-[11px] text-zinc-400 mb-1">CID:</div>
                    <input
                      value={cid}
                      onChange={(e) => setCid(e.target.value.trim())}
                      placeholder="cid_..."
                      className="w-full rounded-lg bg-zinc-900 border border-zinc-800 p-2 text-xs outline-none"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={onBackupToCID}
                      className="rounded-lg border border-zinc-700 px-4 py-2 text-xs font-semibold hover:bg-zinc-900/40"
                    >
                      Backup → CID
                    </button>
                    <button
                      type="button"
                      onClick={onRestoreFromCID}
                      className="rounded-lg border border-zinc-700 px-4 py-2 text-xs font-semibold hover:bg-zinc-900/40"
                    >
                      Restore ← CID
                    </button>
                  </div>

                  <div className="text-[11px] text-zinc-500">
                    Data is not stored on-chain. The chain stores references (CID) only.
                  </div>
                </div>
              ) : null}

              {/* Registry */}
              {tab === "registry" ? (
                <div className="space-y-4">
                  <div className="text-sm font-semibold">Non-Custodial Identity Registry (Chain-Agnostic)</div>

                  <div className="text-xs text-zinc-300 space-y-2">
                    <div>
                      Registry stores metadata and references (CID), not user data. The soul remains independent from any single chain.
                      Chain can be swapped without changing ownership model.
                    </div>
                    <div className="text-xs text-zinc-400">
                      Supported targets (demo abstraction):
                      <ul className="list-disc pl-5 mt-1 space-y-1">
                        <li>Ethereum / EVM</li>
                        <li>Polygon</li>
                        <li>Arbitrum</li>
                      </ul>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={onCommitToChain}
                      className="rounded-lg border border-zinc-700 px-4 py-2 text-xs font-semibold hover:bg-zinc-900/40"
                    >
                      Commit CID → Chain
                    </button>
                    <button
                      type="button"
                      onClick={onRestoreViaChain}
                      className="rounded-lg border border-zinc-700 px-4 py-2 text-xs font-semibold hover:bg-zinc-900/40"
                    >
                      Restore via Chain
                    </button>
                  </div>

                  <div className="text-[11px] text-zinc-500">
                    Production version supports multiple chains through a registry adapter layer.
                  </div>
                </div>
              ) : null}

              {/* Security */}
              {tab === "security" ? (
                <div className="space-y-3">
                  <div className="text-sm font-semibold">Security Framework (Zero-Access)</div>

                  <div className="text-xs text-zinc-300 space-y-2">
                    <div>
                      <b>Zero-access architecture:</b> platform cannot read, decrypt, reset, or technically recover a soul without the seed.
                    </div>
                    <div>
                      <b>End-to-end encryption:</b> SoulState is encrypted client-side. Server (if present) only handles encrypted blobs and references.
                    </div>
                    <div>
                      <b>User responsibility:</b> if the seed is compromised, an attacker can take the soul. This is a non-custodial tradeoff by design.
                    </div>
                    <div className="text-zinc-500">
                      Note: this demo stores seed only in sessionStorage for convenience. Production UX requires explicit offline backup.
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Error */}
            {err ? (
              <div className="mt-3 rounded-xl border border-red-900/60 bg-red-950/20 p-3 text-xs text-red-200">
                {err}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
