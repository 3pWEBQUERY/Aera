import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { normalizeHandle } from "@/lib/handle";
import { env } from "@/lib/env";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = {
  title: "Konto anlegen",
  robots: { index: false },
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ h?: string }>;
}) {
  if (await getCurrentUser()) redirect("/studio");

  const { h } = await searchParams;
  const wish = h ? normalizeHandle(h) : "";
  const suffix =
    env.AELI_ROOT_DOMAIN && env.AELI_ROOT_DOMAIN !== "localhost" ? env.AELI_ROOT_DOMAIN : "aeli.so";

  return (
    <>
      <h1 className="mt-10 text-3xl font-semibold tracking-tight lg:mt-0">
        Deine Seite beginnt hier
      </h1>
      <p className="mt-2 text-sm text-ash">
        {wish ? (
          <>
            Noch zwei Felder, dann gehört{" "}
            <span className="font-medium text-chalk">
              {wish}.{suffix}
            </span>{" "}
            dir.
          </>
        ) : (
          "Konto anlegen, Handle aussuchen, ersten Link setzen. Drei Schritte, kein Fragebogen."
        )}
      </p>

      <SignupForm wishHandle={wish || undefined} />

      <p className="mt-8 text-center text-sm text-ash">
        Schon dabei?{" "}
        <Link href="/login" className="font-medium text-chalk underline underline-offset-4">
          Anmelden
        </Link>
      </p>
    </>
  );
}
