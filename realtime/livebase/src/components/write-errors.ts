// Failed optimistic writes roll back by themselves; this tells the user why.
// A tiny external store holds the one message `WriteErrorToast` shows. It has
// no browser dependencies, and only browser code writes to it, so SSR always
// sees it empty.

export const WRITE_FAILED = "Couldn't save your change";
export const WRITE_NOT_CONFIRMED = "Your change was saved, but hasn't synced back yet";

// Longer text, or text over several lines, is a response body rather than a
// message written for the UI.
const MAX_MESSAGE_LENGTH = 200;

// What to tell the user about a rejected write, or null when there's nothing
// new to say. A server function's error reaches the client as a plain `Error`
// carrying only the server's message, which is a sentence meant for the UI.
// Other errors, such as the `TypeError` from a dropped connection or a
// library's own error class, aren't worded for users.
export function writeErrorMessage(error: unknown): string | null {
  // A write rolled back because an earlier write to the same row failed
  // rejects with no error. The earlier write has already said why.
  if (error === undefined || error === null) return null;
  if (!(error instanceof Error) || error.name !== "Error") return WRITE_FAILED;
  const message = error.message.trim();
  // `awaitTxId` only runs once the server has committed the write, so its
  // errors mean the sync hasn't confirmed it yet; the row catches up later.
  if (/^(Timed out waiting for )?Neon Realtime /.test(message)) return WRITE_NOT_CONFIRMED;
  if (message === "" || message.length > MAX_MESSAGE_LENGTH || message.includes("\n")) return WRITE_FAILED;
  return message;
}

export interface WriteErrorNotice {
  // New for every failure, so a repeated message restarts the hide timer.
  readonly id: number;
  readonly message: string;
}

let notice: WriteErrorNotice | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

// Shows one message at a time: a newer failure replaces the one on screen, so
// a burst of failures doesn't stack up.
export function showWriteError(error: unknown): void {
  const message = writeErrorMessage(error);
  if (message === null) return;
  notice = { id: nextId++, message };
  emit();
}

// Takes an ID so a stale timer can't hide a newer message.
export function dismissWriteError(id: number): void {
  if (notice?.id !== id) return;
  notice = null;
  emit();
}

export function currentWriteError(): WriteErrorNotice | null {
  return notice;
}

export function subscribeToWriteErrors(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
