import { Button, cn } from "~/components/ui";
import { SAMPLE_INPUTS } from "~/lib/constants";
import { useLeadActions } from "~/realtime/actions";

export interface SampleInputsProps {
  readonly className?: string;
  readonly onCreated?: () => void;
}

// The list starts empty, so these one-click inputs are how a demo begins.
// They're buttons styled as chips; `rounded-full!` beats the Button's own
// `rounded-md`, since `cn` doesn't merge classes.
export function SampleInputs({ className, onCreated }: SampleInputsProps) {
  const { createLead } = useLeadActions();

  function create(text: string) {
    createLead(text);
    onCreated?.();
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span className="mr-0.5 text-xs text-fg-subtle">Try:</span>
      {SAMPLE_INPUTS.map((sample) => (
        <Button
          key={sample.label}
          type="button"
          variant="secondary"
          size="xs"
          title={sample.text}
          onClick={() => create(sample.text)}
          className="rounded-full!"
        >
          {sample.label}
        </Button>
      ))}
    </div>
  );
}
