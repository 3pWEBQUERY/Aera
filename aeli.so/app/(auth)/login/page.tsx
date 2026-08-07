import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Anmelden",
  robots: { index: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ weiter?: string }>;
}) {
  if (await getCurrentUser()) redirect("/studio");
  const { weiter } = await searchParams;

  return (
    <>
      <h1 className="mt-10 text-3xl font-semibold tracking-tight lg:mt-0">Willkommen zurück</h1>
      <p className="mt-2 text-sm text-ash">
        Du hast schon ein Konto auf aera.so? Dann melde dich einfach damit an — es ist dasselbe.
      </p>

      <LoginForm next={weiter ?? "/studio"} />

      <p className="mt-8 text-center text-sm text-ash">
        Noch kein Konto?{" "}
        <Link href="/signup" className="font-medium text-chalk underline underline-offset-4">
          Handle sichern
        </Link>
      </p>
    </>
  );
}
