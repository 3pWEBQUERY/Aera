import { Card, CardBody } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/dashboard/icons";

/**
 * Lock screen of a space the viewer cannot enter.
 *
 * Two cases that must not look alike, because guests otherwise take a free
 * members' forum for a paid one:
 * - `paid`: the space belongs to a paid membership — the message names it
 *   with its price ("„Werkstatt“ gehört zu Förderkreis (9,99 CHF/Monat).").
 * - `free`: membership is enough and costs nothing.
 *
 * The page composes the sentences (it knows tier, price and viewer); this
 * component only lays them out, so both cases share one look.
 */
export function SpacePaywall({
  variant,
  spaceName,
  message,
  detail,
  cta,
}: {
  variant: "paid" | "free";
  spaceName: string;
  /** Main sentence under the space name. */
  message: string;
  /** Optional second line, e.g. what else the membership includes. */
  detail?: string | null;
  cta: { href: string; label: string };
}) {
  return (
    <div className="mx-auto max-w-xl">
      <Card>
        <CardBody className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--brand-soft)]">
            <Icon
              name={variant === "paid" ? "lock" : "members"}
              size={26}
              className="text-[var(--brand)]"
            />
          </div>
          <h1 className="display-serif mt-3 text-2xl text-[#161613]">{spaceName}</h1>
          <p className="mt-2 text-[#161613]/75">{message}</p>
          {detail && <p className="mt-1 text-sm text-[#161613]/65">{detail}</p>}
          <div className="mt-5">
            <ButtonLink href={cta.href} variant="brand">
              {cta.label}
            </ButtonLink>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
