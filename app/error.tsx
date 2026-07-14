"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Icon } from "@/components/dashboard/icons";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-500">
          <Icon name="alert" size={24} />
        </span>
        <h1 className="mt-4 text-xl font-bold tracking-tight text-slate-900">
          Etwas ist schiefgelaufen
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut —
          wenn das Problem bestehen bleibt, melde dich gerne bei uns.
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            onClick={() => reset()}
            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Erneut versuchen
          </button>
          <Link
            href="/"
            className="text-sm font-semibold text-slate-600 hover:text-slate-900 hover:underline"
          >
            Zur Startseite
          </Link>
        </div>
      </div>
    </div>
  );
}
