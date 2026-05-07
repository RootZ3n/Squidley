import { getLocalStatusNoteCopy, type LocalStatusNoteVariant } from "@/lib/localStatusNote";

export function LocalStatusNote({
  variant,
  className = "",
}: {
  variant: LocalStatusNoteVariant;
  className?: string;
}) {
  const copy = getLocalStatusNoteCopy(variant);
  return (
    <p className={`inline-flex rounded-full border px-3 py-1 text-xs ${copy.className} ${className}`}>
      {copy.text}
    </p>
  );
}
