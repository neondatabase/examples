import { useId, useRef, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent } from "react";
import { Plus } from "lucide-react";

import { Button, Kbd, Textarea, ZapIcon, cn } from "~/components/ui";
import { MAX_INPUT_LENGTH } from "~/lib/constants";
import { useLeadActions } from "~/realtime/actions";

import { SampleInputs } from "./SampleInputs";

export interface LeadCaptureProps {
  readonly showSamples?: boolean;
  readonly onCreated?: () => void;
}

// A soft accent ring and glow while the field has focus.
const CARD_FOCUS_CLASS =
  "focus-within:border-accent/40 focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-accent)_10%,transparent),0_16px_48px_-24px_color-mix(in_oklab,var(--color-accent)_60%,transparent)]";

// The card draws the field's border, background, and focus state, so the
// textarea's own chrome is switched off.
const FIELD_RESET_CLASS =
  "max-h-80 resize-none border-transparent! bg-transparent! px-4! pt-3.5! pb-1! text-[15px]! shadow-none! ring-0! outline-none!";

const MAX_INPUT_LABEL = MAX_INPUT_LENGTH.toLocaleString("en-US");

export function LeadCapture({ showSamples = true, onCreated }: LeadCaptureProps) {
  const { createLead } = useLeadActions();
  const [text, setText] = useState("");
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const hintId = useId();
  const modifierKey = useModifierKeyLabel();
  const rawText = text.trim();
  // The server caps the input, so an over-long paste is refused with a
  // message rather than silently cut off.
  const tooLong = rawText.length > MAX_INPUT_LENGTH;
  const canSubmit = rawText !== "" && !tooLong;

  function submit() {
    if (!canSubmit) return;
    createLead(rawText);
    onCreated?.();
    setText("");
    // Keep the field ready for the next paste, even after a button click.
    fieldRef.current?.focus();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
    if (event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit();
  }

  return (
    <section aria-label="Add a lead">
      <form
        onSubmit={handleSubmit}
        className={cn(
          "rounded-xl border border-line bg-surface transition-[border-color,box-shadow] duration-200",
          CARD_FOCUS_CLASS,
        )}
      >
        <Textarea
          ref={fieldRef}
          autoGrow
          rows={3}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Lead details"
          aria-invalid={tooLong || undefined}
          aria-describedby={hintId}
          aria-keyshortcuts="Meta+Enter Control+Enter"
          placeholder="Paste anything about a lead: an email, a LinkedIn URL, a website, or your notes"
          className={FIELD_RESET_CLASS}
        />
        <div className="flex items-center justify-between gap-3 px-3 pb-3 pt-1">
          <p
            id={hintId}
            aria-live="polite"
            className={cn("flex min-w-0 items-center gap-1.5 pl-1 text-xs", tooLong ? "text-danger" : "text-fg-subtle")}
          >
            {tooLong ? (
              <span className="truncate">Too long (max {MAX_INPUT_LABEL} characters)</span>
            ) : (
              <>
                <ZapIcon size={12} className="shrink-0 text-accent" />
                <span className="truncate">Agents extract the lead, then research it live</span>
              </>
            )}
          </p>
          <div className="flex shrink-0 items-center gap-2.5">
            <span aria-hidden className="hidden items-center gap-1 sm:inline-flex">
              <Kbd>{modifierKey}</Kbd>
              <Kbd>↵</Kbd>
            </span>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={!canSubmit}
              leadingIcon={<Plus className="size-3.5" />}
            >
              Add lead
            </Button>
          </div>
        </div>
      </form>
      {showSamples ? <SampleInputs className="mt-3 px-1" onCreated={onCreated} /> : null}
    </section>
  );
}

const subscribeToNothing = () => () => {};

// The server can't know the platform, so it renders "Ctrl" and the browser
// switches to "⌘" after hydration without a mismatch.
function useModifierKeyLabel(): string {
  return useSyncExternalStore(
    subscribeToNothing,
    () => (/Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl"),
    () => "Ctrl",
  );
}
