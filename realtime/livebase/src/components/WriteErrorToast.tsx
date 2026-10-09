import { useEffect, useSyncExternalStore } from "react";
import { TriangleAlert, X } from "lucide-react";

import { IconButton, cn } from "~/components/ui";
import {
  currentWriteError,
  dismissWriteError,
  subscribeToWriteErrors,
  type WriteErrorNotice,
} from "~/components/write-errors";

const HIDE_AFTER_MS = 6_000;

const noNotice = (): WriteErrorNotice | null => null;

// Says why a write was rolled back, without blocking the page. Mounted once,
// in `AppShell`. The status element stays mounted while empty, so screen
// readers have registered the live region by the time a message lands in it.
export function WriteErrorToast() {
  const notice = useSyncExternalStore(subscribeToWriteErrors, currentWriteError, noNotice);

  useEffect(() => {
    if (notice === null) return;
    const timer = setTimeout(() => dismissWriteError(notice.id), HIDE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div
        className={cn(
          "flex max-w-md items-start gap-2",
          notice !== null &&
            "pointer-events-auto rounded-lg border border-line-strong bg-surface-2 py-1.5 pr-1.5 pl-3 shadow-lg shadow-black/40",
        )}
      >
        {notice !== null && <TriangleAlert aria-hidden className="mt-1 size-3.5 shrink-0 text-danger" />}
        <p role="status" className="min-w-0 py-0.5 text-[13px] text-fg">
          {notice?.message}
        </p>
        {notice !== null && (
          <IconButton label="Dismiss" size="xs" onClick={() => dismissWriteError(notice.id)}>
            <X aria-hidden className="size-3.5" />
          </IconButton>
        )}
      </div>
    </div>
  );
}
