import { cn } from "./cn";
import { FallbackImage } from "./FallbackImage";
import { avatarSources } from "./image-sources";
import { type AvatarSize, avatarBox, Monogram } from "./Monogram";

// A person's photo, once enrichment records one (`people.avatar_url`),
// otherwise a round monogram. A photo that fails to load, such as a
// Gravatar miss (`d=404`) or a removed X image, falls back to the monogram too.
// People are circles; companies are squares (see `CompanyLogo`).
export function Avatar({
  name,
  imageUrl,
  size = "md",
  className,
}: {
  name: string | null | undefined;
  imageUrl?: string | null;
  size?: AvatarSize;
  className?: string;
}) {
  return (
    <FallbackImage
      sources={avatarSources(imageUrl)}
      fallback={<Monogram name={name} size={size} shape="circle" className={className} />}
      className={cn(
        "shrink-0 rounded-full bg-surface-2 object-cover outline -outline-offset-1 outline-white/10",
        avatarBox[size],
        className,
      )}
    />
  );
}
