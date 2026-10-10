import type { Company } from "~/db/schema";
import { cn } from "./cn";
import { FallbackImage } from "./FallbackImage";
import { companyLogoKey as logoKey, companyLogoSources, type LogoInputs } from "./image-sources";
import { type AvatarSize, avatarBox, Monogram, squareRadius } from "./Monogram";

// Optional and public: Brandfetch client IDs are made for embedding in
// pages. Vite inlines it into both bundles, so SSR and hydration pick the same
// first source.
const BRANDFETCH_CLIENT_ID: string | null = import.meta.env.VITE_BRANDFETCH_CLIENT_ID?.trim() || null;

// The company's logo, from the first of these sources that loads:
// Brandfetch, the logo enrichment recorded, then a favicon service. Each one
// appears as soon as its input does, so a logo shows once the domain is known.
// A source that fails to load steps down to the next, and the square
// monogram stands in until there's a source and after the last one fails.
export function CompanyLogo({
  company,
  size = "md",
  className,
}: {
  company: Pick<Company, "name" | "domain" | "logoUrl"> | null | undefined;
  size?: AvatarSize;
  className?: string;
}) {
  const name = company?.name ?? company?.domain ?? null;
  const sources = company ? companyLogoSources(company, BRANDFETCH_CLIENT_ID) : [];

  return (
    <FallbackImage
      sources={sources}
      fallback={<Monogram name={name} size={size} shape="square" className={className} />}
      className={cn(
        "shrink-0 bg-surface-2 object-cover outline -outline-offset-1 outline-white/10",
        avatarBox[size],
        squareRadius[size],
        className,
      )}
    />
  );
}

// The value a `Flash` around a logo watches, so the logo flashes when a write
// brings or changes it, and not when a source merely fails to load.
export function companyLogoKey(company: LogoInputs | null | undefined): string | null {
  return company ? logoKey(company, BRANDFETCH_CLIENT_ID) : null;
}
