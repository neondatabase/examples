import { type ReactNode, useState } from "react";
import { firstUsable, type ImageSource, tooSmall } from "./image-sources";

// Shows the first of `sources` that loads, stepping down one source on each
// failure and to `fallback` (a monogram) once all have failed. Shared by
// `CompanyLogo` and `Avatar`; the order lives in `image-sources.ts`.
export function FallbackImage({
  sources,
  fallback,
  className,
}: {
  sources: readonly ImageSource[];
  fallback: ReactNode;
  className?: string;
}) {
  // Remember which URLs failed rather than a position in the list, so a new
  // source (say, an agent recording a logo) gets a fresh attempt without an
  // effect, and one that failed isn't retried on every render.
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const source = firstUsable(sources, failed);
  if (!source) return fallback;

  const { url, minPx } = source;
  const fail = () => setFailed((current) => (current.has(url) ? current : new Set(current).add(url)));

  return (
    <img
      // A fresh element per source, so `complete` and the natural size below
      // always describe this source's request, never the one it replaced.
      key={url}
      src={url}
      // Decorative: callers render the name alongside.
      alt=""
      decoding="async"
      referrerPolicy={source.referrerPolicy}
      draggable={false}
      onError={fail}
      onLoad={(event) => {
        const image = event.currentTarget;
        if (tooSmall(image.naturalWidth, image.naturalHeight, minPx)) fail();
      }}
      ref={(node) => {
        // An SSR-rendered image can finish before React hydrates and attaches
        // the handlers; judge that case on mount. The image isn't lazy, so a
        // complete image with no natural width either failed or is an SVG
        // without intrinsic dimensions, which `decode()` tells apart.
        if (!node?.complete) return;
        if (node.naturalWidth === 0) node.decode().catch(fail);
        else if (tooSmall(node.naturalWidth, node.naturalHeight, minPx)) fail();
      }}
      className={className}
    />
  );
}
