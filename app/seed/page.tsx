"use client";

import { useEffect, useRef, useState } from "react";
import { generateSeed, validateSeed } from "@/core/seed";
import { seedToSoulAddress } from "@/core/identity";
import type { SoulState, Msg } from "@/core/state";
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
import { chat } from "@/core/chat"; // важно: используем реальный вызов /api/chat

type ViewMode = "seed" | "chat" | "advanced";

const SESSION_SEED_KEY = "soulnet:seed:session";
const SESSION_VIEW_KEY = "soulnet:view:session";

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

export default function SeedPage() {
  const [mounted, setMounted] = useState(false);

  const [view, setView] = useState<ViewMode>("seed");

  // seed/address
  const [seedShown, setSeedShown] = useState(""); // показываем только после Create
  const [seedInput, setSeedInput] = useState(""); // фактический seed (но хранится только в sessionStorage)
  const [addr, setAddr] = useState("");

  // vault snapshot
  const [enc, setEnc] = useState<EncryptedBlob | null>(null);
  const [soul, setSoul] = useState<SoulState | null>(null);

  // advanced cid
  const [cid, setCid] = useState<string>("");

  // chat UI
  const [messages, setMessages] = useState<
  { role: "user" | "assistant"; content: string; ts: number }[]
>([
  { role: "assistant", content: "Welcome. Click “Load Soul” to start chatting.", ts: nowTs() },
]);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingSoul, setLoadingSoul] = useState(false);

  // UI info
  const [localInfo, setLocalInfo] = useState("loading…");
  const [err, setErr] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  function refreshLocalInfo() {
    const a = getActiveSoulAddress();
    const snap = loadEncryptedSnapshot();
    const last = getLastCID();
    setLocalInfo(
      `activeSoul=${a ? a.slice(0, 10) + "..." : "null"} | snapshot=${snap ? "yes" : "no"} | cid=${last ?? "null"}`
    );
  }

  function setError(e: any, fallback: string) {
    setErr(e?.message || fallback);
  }

  // ===== Mount init (fix hydration + restore session state) =====
  useEffect(() => {
    setMounted(true);

    // restore seed from sessionStorage (so F5 doesn't ask again)
    const s = safeSessionGet(SESSION_SEED_KEY);
    if (s) setSeedInput(s);

    // restore last view from sessionStorage
    const v = safeSessionGet(SESSION_VIEW_KEY) as ViewMode;
    if (v === "seed" || v === "chat" || v === "advanced") setView(v);

    // restore local snapshot/cid/addr for UI info
    const last = getLastCID();
    if (last) setCid(last);

    const snap = loadEncryptedSnapshot();
    if (snap) setEnc(snap);

    const a = getActiveSoulAddress();
    if (a) setAddr(a);

    refreshLocalInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep view in sessionStorage
  useEffect(() => {
    if (!mounted) return;
    safeSessionSet(SESSION_VIEW_KEY, view);
  }, [mounted, view]);

  // autoscroll
  useEffect(() => {
    if (view !== "chat") return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, view]);

  // ===== AUTO RESTORE CHAT ON F5 =====
  // If user is on chat view and seed exists in sessionStorage,
  // we automatically decrypt and restore messages.
  useEffect(() => {
    if (!mounted) return;
    if (view !== "chat") return;

    // already loaded or loading
    if (soul || loadingSoul) return;

    const s = seedInput.trim();
    if (!validateSeed(s)) return;

    const snap = loadEncryptedSnapshot();
    if (!snap) return;

    // auto load
    onLoadSoulForChat(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, view]);

  // ===== Seed actions =====
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

    // create initial soul state (empty chat)
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
    setView("seed");
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
    setView("seed");
  }

  function onOpenChat() {
    setErr("");
    setView("chat");
  }

  function onBackToSeed() {
    setErr("");
    setView("seed");
  }

  // ===== Chat: Load / Send / Auto-save =====
  async function onLoadSoulForChat(silent = false) {
    if (!silent) setErr("");
    setLoadingSoul(true);

    try {
      const s = seedInput.trim();
      if (!validateSeed(s)) throw new Error("Go to “Seed” and paste your 24-word seed first.");

      const snap = loadEncryptedSnapshot();
      if (!snap) throw new Error("No local snapshot found. Create seed first.");

      const st = await decryptSoulState(s, snap);
      setSoul(st);
      setEnc(snap);

      const restored = (st.chat?.messages ?? []).map((m) => ({
  ...m,
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
    // autosave only if we can encrypt
    const s = seedInput.trim();
    if (!validateSeed(s)) return;
    if (!soul) return;

    const updated: SoulState = {
      ...soul,
      chat: { v: 1, messages: nextMessages, updatedAt: nowTs() },
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
      // call real /api/chat
      const r = await chat({
        messages: base.map((x) => ({ role: x.role, content: x.content })),
        soul,
      });

      const nextAssistant: Msg = { role: "assistant", content: r.message.content, ts: nowTs() };
      const nextAll = [...base, nextAssistant];
      setMessages(nextAll);

      // AUTO-SAVE after assistant reply
      await autosaveChat(nextAll);
    } catch (e: any) {
      setError(e, "Send failed");
    } finally {
      setSending(false);
    }
  }

  // ===== Advanced (kept, hidden under Advanced) =====
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

    // seed is session-only; user asked not to lose it on refresh,
    // but "Wipe local" should not force-remove session seed.
    // If you want to clear it too, uncomment:
    // safeSessionSet(SESSION_SEED_KEY, "");

    setView("seed");
  }

  // avoid hydration mismatch: render localInfo only after mounted
  const localInfoText = mounted ? localInfo : "loading…";
  const seedOk = validateSeed(seedInput.trim());

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl p-6 space-y-4">
        <div className="text-sm text-zinc-400">SoulNet MVP • One Screen</div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
          <div className="text-lg font-semibold">Create / Restore</div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onCreateSeed}
              className="rounded-lg bg-zinc-100 text-zinc-900 px-4 py-2 text-sm font-medium"
            >
              Create seed
            </button>

            <button
              type="button"
              onClick={onRestoreFromSeed}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium"
            >
              Restore from seed
            </button>

            <button
              type="button"
              onClick={onOpenChat}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium"
            >
              Open Chat
            </button>

            <button
              type="button"
              onClick={() => setView((v) => (v === "advanced" ? "seed" : "advanced"))}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium"
            >
              Advanced
            </button>

            <button
              type="button"
              onClick={onWipeLocal}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium"
            >
              Wipe local
            </button>
          </div>

          <div className="text-xs text-zinc-500">Local: {localInfoText}</div>

          {/* SEED BLOCK */}
          {view === "seed" ? (
            <div className="space-y-3">
              <div className="text-xs text-zinc-400">
  <b>Demo note:</b> The seed is <b>never sent to any server</b>. For demo convenience only, it may be cached in this tab session (sessionStorage). In production, users store the seed offline (paper / secure vault).
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
                className="w-full rounded-lg bg-zinc-950 border border-zinc-800 p-3 text-sm outline-none"
              />

              {seedShown ? (
                <div className="text-xs text-zinc-400 break-words">
                  <div className="font-medium text-zinc-300 mb-1">Generated seed (copy & store safely):</div>
                  {seedShown}
                </div>
              ) : null}

              {addr ? (
                <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-3">
                  <div className="text-xs text-emerald-200/90">soul_address</div>
                  <div className="font-mono text-sm break-all">{addr}</div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* CHAT BLOCK */}
          {view === "chat" ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-lg font-semibold">Digital Soul (Chat)</div>
                <div className="text-xs text-zinc-500">
                  Seed: {seedOk ? "ok" : "missing"} • Auto-save: on
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onLoadSoulForChat(false)}
                  disabled={!seedOk || loadingSoul}
                  className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium disabled:opacity-50"
                >
                  {loadingSoul ? "Loading…" : "Load Soul"}
                </button>

                <button
                  type="button"
                  onClick={onBackToSeed}
                  className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium"
                >
                  Back to Seed
                </button>
              </div>

              {!seedOk ? (
                <div className="text-xs text-zinc-500">
                  Go to “Seed” and paste/restore your 24-word seed to unlock chat decryption.
                </div>
              ) : null}

              <div
                ref={listRef}
                className="h-[420px] overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 space-y-3"
              >
                {messages.map((m, i) => (
                  <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
                    <div
                      className={[
                        "inline-block max-w-[92%] whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-sm",
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
                  className="flex-1 rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm outline-none"
                />
                <button
                  type="button"
                  onClick={onSend}
                  disabled={sending}
                  className="rounded-lg bg-zinc-100 text-zinc-900 px-4 py-2 text-sm font-medium disabled:opacity-50"
                >
                  {sending ? "Sending…" : "Send"}
                </button>
              </div>

              <div className="text-xs text-zinc-500">
                Flow: Create/Restore seed → Open Chat → Load Soul → chat. Messages are auto-saved into the encrypted snapshot.
                Refresh (F5) keeps seed in session + auto-restores chat.
              </div>
            </div>
          ) : null}

          {/* ADVANCED BLOCK */}
          {view === "advanced" ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
              <div className="text-sm font-semibold text-zinc-200">Advanced (IPFS / Chain)</div>

              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <div className="text-xs text-zinc-400 mb-1">CID:</div>
                <input
                  value={cid}
                  onChange={(e) => setCid(e.target.value.trim())}
                  placeholder="cid_..."
                  className="w-full rounded-md bg-zinc-900 border border-zinc-800 p-2 text-xs outline-none"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onBackupToCID}
                  className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium"
                >
                  Backup → CID
                </button>
                <button
                  type="button"
                  onClick={onRestoreFromCID}
                  className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium"
                >
                  Restore ← CID
                </button>
                <button
                  type="button"
                  onClick={onCommitToChain}
                  className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium"
                >
                  Commit CID → Chain
                </button>
                <button
                  type="button"
                  onClick={onRestoreViaChain}
                  className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium"
                >
                  Restore via Chain
                </button>
              </div>

              <div className="text-xs text-zinc-500">
                Not core UX. Demo path for “snapshot → CID → chain registry”.
              </div>
            </div>
          ) : null}

          {err ? (
            <div className="rounded-lg border border-red-900/60 bg-red-950/20 p-3 text-sm text-red-200">
              {err}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
