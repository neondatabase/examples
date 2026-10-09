import {
  useCallback,
  useLayoutEffect,
  useRef,
  type InputEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type TextareaHTMLAttributes,
} from "react";

import { cn } from "./cn";

const fieldClass =
  "w-full rounded-md border border-line bg-surface-2 text-[13px] text-fg transition-colors placeholder:text-fg-subtle hover:border-line-strong focus:border-line-strong disabled:cursor-not-allowed disabled:opacity-50";

export function Input({
  leadingIcon,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  leadingIcon?: ReactNode;
}) {
  const input = <input className={cn(fieldClass, "h-8 px-2.5", leadingIcon ? "pl-8" : null, className)} {...rest} />;
  if (!leadingIcon) return input;

  return (
    <div className="relative w-full">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-fg-subtle"
      >
        {leadingIcon}
      </span>
      {input}
    </div>
  );
}

export function Textarea({
  autoGrow = false,
  className,
  ref,
  onInput,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  autoGrow?: boolean;
  ref?: Ref<HTMLTextAreaElement>;
}) {
  const local = useRef<HTMLTextAreaElement | null>(null);

  // Keep our own handle for measuring while still honouring the caller's ref.
  const setRef = useCallback(
    (node: HTMLTextAreaElement | null) => {
      local.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  const resize = useCallback(() => {
    const node = local.current;
    if (!autoGrow || !node) return;
    // Collapse first so the field can shrink, then grow to the content plus
    // borders. A CSS max-height still caps it and lets it scroll.
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight + node.offsetHeight - node.clientHeight}px`;
  }, [autoGrow]);

  // Controlled values can change without an input event (reset after submit).
  useLayoutEffect(resize, [resize, rest.value]);

  function handleInput(event: InputEvent<HTMLTextAreaElement>) {
    onInput?.(event);
    resize();
  }

  return (
    <textarea
      ref={setRef}
      onInput={handleInput}
      className={cn(fieldClass, "block px-3 py-2 leading-relaxed", autoGrow ? "resize-none" : "resize-y", className)}
      {...rest}
    />
  );
}
