import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ArrowUpRight, Pencil, type LucideIcon } from "lucide-react";

import { cn, Flash, Kbd } from "~/components/ui";
import type { WriterKind } from "~/db/schema";
import { hostname } from "~/lib/format";
import { normalizeUrl } from "~/lib/normalize";

export interface EditableFieldProps {
  readonly value: string | number | null;
  readonly onSave: (next: string | null) => void;
  readonly placeholder?: string;
  readonly multiline?: boolean;
  readonly mono?: boolean;
  readonly numeric?: boolean;
  readonly writer?: WriterKind | null;
  readonly className?: string;
  // Custom rendering for a non-empty value, for example a link.
  readonly display?: (value: string | number) => ReactNode;
  // Names the field in its tooltip and editor, since compact grids hide labels.
  readonly label?: string;
  // Wrap a single-line value instead of truncating it, for titles.
  readonly wrap?: boolean;
  readonly maxLength?: number;
  // Checks a trimmed, non-empty draft before it saves. A message keeps the
  // editor open, so a value the server would reject isn't silently rolled back.
  readonly validate?: (draft: string) => string | null;
}

type Draft = { readonly next: string | null } | { readonly error: string };

// Click-to-edit text. The value renders in place and flashes when a user or an
// agent changes it. Editing swaps in a borderless input that inherits the
// surrounding typography, so switching modes doesn't shift the layout.
export function EditableField({
  value,
  onSave,
  placeholder = "Empty",
  multiline = false,
  mono = false,
  numeric = false,
  writer,
  className,
  display,
  label,
  wrap = false,
  maxLength,
  validate,
}: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hintId = useId();
  // Blur also fires after Enter or Escape; this keeps each edit to one commit.
  const activeRef = useRef(false);
  // The text the editor opened with, to tell the user's changes apart. Only
  // the first focus sets it, since focus can return after a rejected blur.
  const initialRef = useRef<string | null>(null);
  const restoreFocusRef = useRef(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const setTrigger = useCallback((element: HTMLElement | null) => {
    triggerRef.current = element;
  }, []);

  // After a keyboard commit, focus returns to the field so Enter edits again.
  useEffect(() => {
    if (editing || !restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    triggerRef.current?.focus();
  }, [editing]);

  const shown = value === null || value === "" ? null : value;
  const current = shown === null ? null : String(shown);

  function startEditing() {
    activeRef.current = true;
    setEditing(true);
  }

  // `text` is null when the edit is cancelled.
  function finishEditing(text: string | null, restoreFocus: boolean) {
    if (!activeRef.current) return;
    // Untouched text never saves, though it can differ from `current`: the
    // field may have changed while the editor was open, and a text input
    // drops newlines.
    const draft = text === null || text === initialRef.current ? null : parseDraft(text, numeric, validate);
    if (draft && "error" in draft) {
      setError(draft.error);
      return;
    }
    activeRef.current = false;
    initialRef.current = null;
    restoreFocusRef.current = restoreFocus;
    setError(null);
    setEditing(false);
    if (draft && draft.next !== current) onSave(draft.next);
  }

  function onEditorKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    // An enclosing list row may toggle on Enter or collapse on Escape.
    event.stopPropagation();
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      finishEditing(null, true);
    } else if (event.key === "Enter" && (!multiline || event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      finishEditing(event.currentTarget.value, true);
    }
  }

  if (editing) {
    const editorClass = cn(
      "block w-full min-w-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-fg outline-none",
      "ring-1 ring-info/50 placeholder:text-fg-subtle aria-invalid:ring-danger/60",
      mono && "font-mono",
    );
    const invalid = error !== null;
    return (
      <div className={cn("-mx-1.5 min-w-0", className)} onClick={(event) => event.stopPropagation()}>
        {multiline ? (
          <textarea
            ref={(element) => {
              if (element) fitToContent(element);
            }}
            rows={1}
            autoFocus
            defaultValue={current ?? ""}
            placeholder={placeholder}
            maxLength={maxLength}
            aria-label={label ?? placeholder}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? hintId : undefined}
            onInput={(event) => {
              fitToContent(event.currentTarget);
              setError(null);
            }}
            onFocus={(event) => {
              initialRef.current ??= event.currentTarget.value;
              const end = event.currentTarget.value.length;
              event.currentTarget.setSelectionRange(end, end);
            }}
            onKeyDown={onEditorKeyDown}
            onBlur={(event) => finishEditing(event.currentTarget.value, false)}
            className={cn(editorClass, "resize-none overflow-hidden")}
          />
        ) : (
          <input
            type="text"
            autoFocus
            defaultValue={current ?? ""}
            placeholder={placeholder}
            maxLength={maxLength}
            aria-label={label ?? placeholder}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? hintId : undefined}
            onInput={() => setError(null)}
            onFocus={(event) => {
              initialRef.current ??= event.currentTarget.value;
              event.currentTarget.select();
            }}
            onKeyDown={onEditorKeyDown}
            onBlur={(event) => finishEditing(event.currentTarget.value, false)}
            className={editorClass}
          />
        )}
        {invalid ? (
          <p id={hintId} role="alert" className={cn(hintClass, "text-danger")}>
            {error}
          </p>
        ) : multiline ? (
          <SaveHint />
        ) : null}
      </div>
    );
  }

  const tooltip = label && !multiline ? (current === null ? label : `${label}: ${current}`) : undefined;
  const valueClass = cn(
    "rounded-md px-1.5 py-0.5 transition-colors group-hover/field:bg-surface-2",
    mono && shown !== null && "font-mono text-[0.92em]",
  );
  const textClass = multiline ? "whitespace-pre-wrap break-words" : wrap ? "break-words" : "truncate";

  // A custom display may hold a link, and a button's content is presentational
  // to assistive tech, so the link sits beside a separate edit button.
  if (shown !== null && display) {
    return (
      <div
        title={tooltip}
        onClick={(event) => {
          event.stopPropagation();
          // Links open instead of starting an edit. Clicks on the edit
          // button land here too.
          if (event.target instanceof Element && event.target.closest("a")) return;
          startEditing();
        }}
        className={cn("group/field -mx-1.5 min-w-0 cursor-text rounded-md", className)}
      >
        <Flash value={value} writer={writer} as="div" className={cn(valueClass, "flex items-center gap-1")}>
          <div className={cn("min-w-0 flex-1", textClass)}>{display(shown)}</div>
          <button
            ref={setTrigger}
            type="button"
            aria-label={`Edit ${label ?? placeholder}`}
            className={cn(
              "flex size-4 shrink-0 items-center justify-center rounded text-fg-subtle opacity-0 transition-opacity",
              "hover:text-fg focus-visible:opacity-100 group-hover/field:opacity-100",
            )}
          >
            <Pencil aria-hidden className="size-3" />
          </button>
        </Flash>
      </div>
    );
  }

  return (
    <div
      ref={setTrigger}
      role="button"
      tabIndex={0}
      title={tooltip}
      onClick={(event) => {
        event.stopPropagation();
        startEditing();
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        event.stopPropagation();
        startEditing();
      }}
      className={cn("group/field -mx-1.5 min-w-0 cursor-text rounded-md", className)}
    >
      <Flash value={value} writer={writer} as="div" className={cn(valueClass, textClass)}>
        {shown === null ? <span className="text-fg-subtle">{placeholder}</span> : current}
      </Flash>
    </div>
  );
}

// The line under the editor. It resets the typography the editor inherits.
const hintClass = "mt-1 flex items-center gap-1 px-1.5 text-[11px] font-normal tracking-normal";

function SaveHint() {
  const modifier = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl";
  return (
    // Clicking the hint mustn't blur the textarea, which would save.
    <p className={cn(hintClass, "text-fg-subtle")} onMouseDown={(event) => event.preventDefault()}>
      <Kbd>{modifier}</Kbd>
      <Kbd>Enter</Kbd>
      <span>to save,</span>
      <Kbd>Esc</Kbd>
      <span>to cancel</span>
    </p>
  );
}

function fitToContent(element: HTMLTextAreaElement) {
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}

// What a draft saves: null when it's empty, or a message when it can't save.
function parseDraft(text: string, numeric: boolean, validate: EditableFieldProps["validate"]): Draft {
  const trimmed = text.trim();
  if (trimmed === "") return { next: null };
  const error = validate?.(trimmed) ?? null;
  if (error !== null) return { error };
  if (!numeric) return { next: trimmed };
  const parsed = parseInteger(trimmed);
  return parsed === null ? { error: "Enter a number" } : { next: String(parsed) };
}

const MAX_INTEGER = 2_147_483_647; // Postgres `integer`
const SUFFIXES: Record<string, number> = { k: 1_000, m: 1_000_000, b: 1_000_000_000 };

// Parses "50000", "50,000", "$50k" or "1.2M" to an integer, because deal
// values get typed all of these ways. Null when the text isn't a number, or is
// negative, which neither a deal value nor a year can be.
export function parseInteger(text: string | null): number | null {
  if (text === null) return null;
  const match = /^(\d+(?:\.\d+)?)([kmb])?$/i.exec(text.replace(/[\s,_$]/g, ""));
  if (!match) return null;
  const multiplier = match[2] ? (SUFFIXES[match[2].toLowerCase()] ?? 1) : 1;
  const parsed = Math.round(Number(match[1]) * multiplier);
  return Number.isSafeInteger(parsed) && parsed <= MAX_INTEGER ? parsed : null;
}

// An external link that shows only the hostname. Agents write URLs from web
// pages, so they're untrusted: only http(s) URLs become links.
export function HostLink({ url, className }: { url: string; className?: string }) {
  const href = normalizeUrl(url);
  if (!href) return <span className={className}>{url}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => event.stopPropagation()}
      className={cn(
        "inline-flex max-w-full items-center gap-0.5 text-fg-muted underline-offset-2 transition-colors",
        // Inset, because a truncating parent clips an outer focus outline.
        "hover:text-fg hover:underline focus-visible:-outline-offset-2",
        className,
      )}
    >
      <span className="truncate">{hostname(href) ?? href}</span>
      <ArrowUpRight aria-hidden className="size-3 shrink-0 opacity-70" />
    </a>
  );
}

// An icon-led row in a compact fact grid. The icon stands in for the label,
// which the field shows as its placeholder and tooltip.
export function Fact({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Icon aria-hidden className="size-3.5 shrink-0 text-fg-subtle" />
      <div className="min-w-0 flex-1 text-[13px] text-fg">{children}</div>
    </div>
  );
}
