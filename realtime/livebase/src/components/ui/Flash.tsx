import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { WriterKind } from "~/db/schema";
import { cn } from "./cn";

// Matches the `.flash-agent` and `.flash-user` animation length in styles.css.
const FLASH_MS = 1200;

type FlashKind = "agent" | "user";

function flashKind(writer: WriterKind | null | undefined): FlashKind | null {
  switch (writer) {
    case "agent":
      return "agent";
    case "user":
      return "user";
    default:
      return null;
  }
}

// Rows arrive as fresh objects, so timestamps are new `Date` instances even
// when nothing changed; compare those by time.
function sameValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return Object.is(a, b);
}

// Highlights its contents when `value` changes: green for agent writes, blue
// for user writes.
export function Flash({
  value,
  writer,
  as = "span",
  className,
  children,
}: {
  value: unknown;
  writer: WriterKind | null | undefined;
  as?: "span" | "div";
  className?: string;
  children: ReactNode;
}) {
  const previous = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // `count` goes up on every change, so the effect below can restart the
  // animation when a second write lands while the first is still showing.
  const [{ kind, count }, setState] = useState<{ kind: FlashKind | null; count: number }>({
    kind: null,
    count: 0,
  });

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    // `previous` starts as the mount value, so the first render never flashes.
    if (sameValue(previous.current, value)) return;
    previous.current = value;
    // The row's last-writer column says who made this change.
    const next = flashKind(writer);
    if (next === null) return;
    clearTimeout(timer.current);
    setState((s) => ({ kind: next, count: s.count + 1 }));
    timer.current = setTimeout(() => setState((s) => ({ kind: null, count: s.count })), FLASH_MS);
  }, [value, writer]);

  const node = useRef<HTMLElement | null>(null);
  const setNode = useCallback((element: HTMLElement | null) => {
    node.current = element;
  }, []);

  // Restart the CSS animation on each change, including one that has already
  // finished while the class is still on: clearing `animation`, forcing a style
  // flush (reading `offsetWidth`) and restoring it makes the browser start it
  // afresh. Doing it in place, rather
  // than re-keying the element, keeps children mounted, so an inline editor or
  // a loading logo inside a flashing field keeps its state.
  useLayoutEffect(() => {
    const element = node.current;
    if (count === 0 || element === null) return;
    element.style.animation = "none";
    void element.offsetWidth;
    element.style.animation = "";
  }, [count]);

  const classes = cn(kind === "agent" && "flash-agent", kind === "user" && "flash-user", className);
  return as === "div" ? (
    <div ref={setNode} className={classes}>
      {children}
    </div>
  ) : (
    <span ref={setNode} className={classes}>
      {children}
    </span>
  );
}
