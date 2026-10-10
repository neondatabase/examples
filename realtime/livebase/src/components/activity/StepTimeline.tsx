import {
  Bot,
  Brain,
  CircleDot,
  TriangleAlert,
  Workflow,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { Spinner, cn } from "~/components/ui";
import { formatDuration } from "~/lib/format";
import type { RunStep, StepKind, StepStatus } from "~/lib/types";

const STEP_ICONS: Record<StepKind, LucideIcon> = {
  model: Brain,
  tool: Wrench,
  workflow: Workflow,
  agent: Bot,
  error: TriangleAlert,
  other: CircleDot,
};

// Nested steps shift right by this much per level. Deep trees are clamped so
// the timeline stays readable in the narrow inline panel.
const INDENT_PX = 20;
const MAX_INDENT_DEPTH = 3;
// The rail runs through the centre of a 20 px (`size-5`) node.
const RAIL_X_PX = 9;

// `runs.ts` marks a step stopped when a cancel or a restart cut it off, so it
// neither spins nor reads as a failure.
const NODE_STYLES: Record<StepStatus, string> = {
  running: "border-accent/60 bg-accent/10 text-accent ring-4 ring-accent/10",
  completed: "border-line-strong bg-surface-2 text-fg-muted",
  failed: "border-danger/60 bg-danger/10 text-danger",
  stopped: "border-dashed border-line-strong text-fg-subtle",
};

export interface StepTimelineProps {
  readonly steps: readonly RunStep[];
}

export function StepTimeline({ steps }: StepTimelineProps) {
  return (
    <ol aria-label="Run steps" className="flex flex-col">
      {steps.map((step, index) => (
        <StepNode key={step.id} step={step} isLast={index === steps.length - 1} />
      ))}
    </ol>
  );
}

interface StepNodeProps {
  readonly step: RunStep;
  readonly isLast: boolean;
}

// Keyed by span, so only genuinely new steps mount and play `animate-enter`:
// that is what makes the agent's progress visible as it happens.
function StepNode({ step, isLast }: StepNodeProps) {
  const Icon = STEP_ICONS[step.kind];
  const indent = Math.min(step.depth, MAX_INDENT_DEPTH) * INDENT_PX;
  const isTool = step.kind === "tool";
  // `runs.ts` labels a tool step from its input once the lead's messages
  // load ("Searching the web for Dane Knecht"). Until then, or for a tool it
  // has no words for, the label is the tool's name, set in code type.
  const isToolName = isTool && !/\s/.test(step.label);

  return (
    <li className="animate-enter relative flex gap-2.5 py-1" style={{ paddingLeft: indent }}>
      <Rail indent={indent} isLast={isLast} />
      <span
        title={step.spanType}
        className={cn(
          "relative flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
          NODE_STYLES[step.status],
        )}
      >
        <Icon aria-hidden className="size-3" strokeWidth={2.25} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex h-5 items-center gap-2">
          <span
            title={step.toolName && step.toolName !== step.label ? `${step.label} (${step.toolName})` : step.label}
            className={cn(
              "min-w-0 truncate",
              isToolName ? "font-mono text-xs" : "text-[13px]",
              step.status === "stopped" ? "text-fg-muted" : "text-fg",
            )}
          >
            {step.label}
          </span>
          <span className="ml-auto flex shrink-0 items-center text-[11px] tabular-nums text-fg-subtle">
            <StepTiming step={step} />
          </span>
        </div>
        {isTool && step.inputSummary && <Summary direction="input" text={step.inputSummary} />}
        {isTool && step.resultSummary && <Summary direction="result" text={step.resultSummary} />}
        {step.status === "failed" && step.errorMessage && (
          <p
            title={step.errorMessage}
            className="animate-enter mt-0.5 line-clamp-2 break-words text-[11px] text-danger"
          >
            {step.errorMessage}
          </p>
        )}
        {/* A tool that completed with an expected failure, such as a page
            robots.txt disallows: the model read it and carried on, so it is a
            note on the step rather than a failed step. */}
        {isTool && step.status === "completed" && step.errorMessage && (
          <p
            title={step.errorMessage}
            className="animate-enter line-clamp-2 break-words font-mono text-[11px] leading-4 text-orange"
          >
            <span aria-hidden className="text-fg-subtle">
              {"← "}
            </span>
            <span className="sr-only">Tool reported: </span>
            {step.errorMessage}
          </p>
        )}
      </div>
    </li>
  );
}

// Each step draws its own piece of the rail, from its node down to the next
// step's node. Nested steps branch off the rail with a rounded elbow.
function Rail({ indent, isLast }: { readonly indent: number; readonly isLast: boolean }) {
  const nested = indent > 0;
  return (
    <>
      {nested && (
        <span
          aria-hidden
          className="absolute top-0 h-3.5 rounded-bl-md border-b border-l border-line"
          style={{ left: RAIL_X_PX, width: indent - RAIL_X_PX }}
        />
      )}
      {!isLast && (
        <span
          aria-hidden
          className={cn("absolute -bottom-1 w-px bg-line", nested ? "top-0" : "top-6")}
          style={{ left: RAIL_X_PX }}
        />
      )}
    </>
  );
}

// The node's colour and the spinner are decorative, so screen readers get the
// state as text.
function StepTiming({ step }: { readonly step: RunStep }) {
  if (step.status === "running") {
    return (
      <>
        <Spinner size="xs" className="text-accent" />
        <span className="sr-only">running</span>
      </>
    );
  }
  if (step.status === "stopped") return <span>stopped</span>;
  const duration =
    step.startedAt && step.endedAt
      ? formatDuration(Math.max(0, step.endedAt.getTime() - step.startedAt.getTime()))
      : null;
  return (
    <>
      {step.status === "failed" && <span className="sr-only">failed</span>}
      {duration && <span>{duration}</span>}
    </>
  );
}

// Tool arguments and results, parsed from the lead's Mastra messages.
function Summary({ direction, text }: { readonly direction: "input" | "result"; readonly text: string }) {
  return (
    <p title={text} className="animate-enter truncate font-mono text-[11px] leading-4 text-fg-muted">
      <span aria-hidden className="text-fg-subtle">
        {direction === "input" ? "→ " : "← "}
      </span>
      <span className="sr-only">{direction === "input" ? "Input: " : "Result: "}</span>
      {text}
    </p>
  );
}
