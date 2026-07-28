import { BadgeMedal } from "./badge-medal";
import type { MemberBadge } from "@/lib/member-badges";

/**
 * Auszeichnungen eines Mitglieds als Reihe.
 *
 * Ueberzaehlige werden nicht abgeschnitten, sondern gezaehlt — wer acht hat,
 * soll das sehen, ohne dass die Zeile umbricht.
 */
export function BadgeRow({
  badges,
  size = 26,
  max = 5,
  className,
}: {
  badges: MemberBadge[];
  size?: number;
  max?: number;
  className?: string;
}) {
  if (badges.length === 0) return null;
  const shown = badges.slice(0, max);
  const rest = badges.length - shown.length;
  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ""}`}>
      {shown.map((b) => (
        <BadgeMedal
          key={b.id}
          look={b}
          size={size}
          title={b.description ? `${b.name} — ${b.description}` : b.name}
        />
      ))}
      {rest > 0 && (
        <span className="text-[11px] font-semibold text-[#161613]/45">+{rest}</span>
      )}
    </span>
  );
}
