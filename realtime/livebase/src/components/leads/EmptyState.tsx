import { ZapIcon } from "~/components/ui";

import { SampleInputs } from "./SampleInputs";

export interface EmptyStateProps {
  readonly onCreated?: () => void;
}

// Shown when the workspace has no leads at all, which is how every demo
// starts.
export function EmptyState({ onCreated }: EmptyStateProps) {
  return (
    <section className="flex flex-col items-center rounded-lg border border-dashed border-line bg-surface/40 px-6 py-14 text-center">
      <span className="flex size-10 items-center justify-center rounded-full border border-line bg-surface text-accent shadow-[0_0_24px_-6px_color-mix(in_oklab,var(--color-accent)_45%,transparent)]">
        <ZapIcon size={18} />
      </span>
      <h2 className="mt-4 text-sm font-medium text-fg">No leads yet</h2>
      <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-fg-muted">
        Paste an email, a profile URL, a website, or a few notes above. Agents pick out the person and the
        company, then research them while you watch.
      </p>
      <SampleInputs className="mt-6 justify-center" onCreated={onCreated} />
    </section>
  );
}
