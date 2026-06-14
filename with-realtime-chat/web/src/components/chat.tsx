"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const WS_URL = process.env.NEXT_PUBLIC_CHAT_WS_URL!;
// The function speaks HTTP on the same host (image uploads) and WS (chat).
const HTTP_URL = WS_URL.replace(/^wss:/, "https:").replace(/^ws:/, "http:");

type Message = {
  id: number;
  userName: string;
  body: string;
  imageUrl: string | null;
  createdAt: string;
};

function normalize(raw: Record<string, unknown>): Message {
  return {
    id: Number(raw.id),
    userName: String(raw.userName ?? raw.user_name ?? "anon"),
    body: String(raw.body ?? ""),
    imageUrl:
      typeof raw.imageUrl === "string"
        ? raw.imageUrl
        : typeof raw.image_url === "string"
          ? raw.image_url
          : null,
    createdAt: String(raw.createdAt ?? raw.created_at ?? ""),
  };
}

async function getToken(): Promise<string> {
  const res = await fetch("/api/auth/token", { credentials: "include" });
  const data = (await res.json()) as { token?: string };
  if (!data.token) throw new Error("No token");
  return data.token;
}

export function Chat({ userName }: { userName: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [connected, setConnected] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  function addMessage(msg: Message) {
    setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
  }

  // Load history from the Next.js backend.
  useEffect(() => {
    fetch("/api/messages")
      .then((r) => r.json())
      .then((d: { messages?: Record<string, unknown>[] }) =>
        setMessages((d.messages ?? []).map(normalize)),
      )
      .catch(() => {});
  }, []);

  // Connect to the Neon Function WebSocket, reconnecting with backoff. Events are
  // typed: { type: "message", message } or { type: "delete", id } (moderation).
  useEffect(() => {
    let closed = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout>;

    async function connect() {
      if (closed) return;
      let token: string;
      try {
        token = await getToken();
      } catch {
        timer = setTimeout(connect, Math.min(1000 * 2 ** retry++, 15000));
        return;
      }
      const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;
      ws.onopen = () => {
        retry = 0;
        setConnected(true);
      };
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data) as { type: string; message?: Record<string, unknown>; id?: number };
        if (data.type === "message" && data.message) addMessage(normalize(data.message));
        else if (data.type === "delete" && typeof data.id === "number")
          setMessages((prev) => prev.filter((m) => m.id !== data.id));
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) timer = setTimeout(connect, Math.min(1000 * 2 ** retry++, 15000));
      };
      ws.onerror = () => ws.close();
    }

    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      wsRef.current?.close();
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${HTTP_URL}/upload`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error("upload failed");
      const data = (await res.json()) as { url: string };
      setPendingImage(data.url);
    } catch {
      // ignore; keep it simple
    } finally {
      setUploading(false);
    }
  }

  function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if ((!body && !pendingImage) || wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ body, imageUrl: pendingImage }));
    setDraft("");
    setPendingImage(null);
  }

  return (
    <>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-muted-foreground text-sm">No messages yet. Say hi!</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="text-sm">
            <span className={m.userName === userName ? "font-semibold" : "font-medium"}>
              {m.userName}
            </span>
            {m.body && <span> {m.body}</span>}
            {m.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={m.imageUrl}
                alt=""
                className="mt-1 max-h-60 rounded-md border"
              />
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {pendingImage && (
        <div className="flex items-center gap-2 border-t px-3 pt-2 text-xs">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pendingImage} alt="" className="h-10 w-10 rounded object-cover" />
          <span className="text-muted-foreground">Image attached</span>
          <button type="button" onClick={() => setPendingImage(null)} aria-label="Remove image">
            <X className="size-4" />
          </button>
        </div>
      )}

      <form onSubmit={send} className="flex gap-2 border-t p-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={onPickImage}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          aria-label="Attach image"
        >
          <ImagePlus className="size-4" />
        </Button>
        <Input
          placeholder={connected ? "Message everyone…" : "Connecting…"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button type="submit" disabled={!connected}>
          Send
        </Button>
      </form>
    </>
  );
}
