import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-5 text-center">
      <span className="bg-[var(--brand)] flex h-12 w-12 items-center justify-center rounded-xl text-xl font-bold text-white">
        A
      </span>
      <h1 className="mt-6 text-2xl font-bold text-slate-900">Seite nicht gefunden</h1>
      <p className="mt-2 text-slate-500">
        Diese Community oder Seite existiert nicht.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-lg bg-violet-700 px-5 py-2.5 font-medium text-white hover:bg-violet-800"
      >
        Zur Startseite
      </Link>
    </main>
  );
}
