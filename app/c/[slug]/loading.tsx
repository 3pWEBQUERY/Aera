export default function CommunityLoading() {
  return (
    <div className="animate-pulse">
      {/* Hero-Fläche */}
      <div className="h-[380px] w-full bg-slate-100" />

      {/* Zentrierte Spalte mit Karten-Placeholdern */}
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-8 sm:px-6">
        <div className="h-40 rounded-2xl border border-slate-200 bg-slate-100" />
        <div className="h-40 rounded-2xl border border-slate-200 bg-slate-100" />
        <div className="h-40 rounded-2xl border border-slate-200 bg-slate-100" />
      </div>
    </div>
  );
}
