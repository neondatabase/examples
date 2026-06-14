"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const WS_URL = process.env.NEXT_PUBLIC_CHAT_WS_URL!;

type Message = {
  id: number;
  userName: string;
  body: string;
  createdAt: string;
};

// History rows come back snake_case (raw SQL); live rows come back camelCase
// (Drizzle .returning()). Normalize both.
function normalize(raw: Record<string, unknown>): Message {
  return {
    id: Number(raw.id),
    userName: String(raw.userName ?? raw.user_name ?? "anon"),
    body: String(raw.body ?? ""),
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
  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  function addMessage(msg: Message) {
    setMessages((prev) =>
      prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
    );
  }

  // Load history once from the Next.js backend.
  useEffect(() => {
    fetch("/api/messages")
      .then((r) => r.json())
      .then((d: { messages: Record<string, unknown>[] }) =>
        setMessages(d.messages.map(normalize)),
      )
      .catch(() => {});
  }, []);

  // Connect to the Neon Function WebSocket, reconnecting with backoff.
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
      ws.onmessage = (event) => addMessage(normalize(JSON.parse(event.data)));
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

  function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(body);
    setDraft("");
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
            <span className="text-muted-foreground"> </span>
            <span>{m.body}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={send} className="flex gap-2 border-t p-3">
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
