export default function DashboardLoading() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Seitenkopf */}
      <div className="space-y-3">
        <div className="h-7 w-56 rounded-xl bg-slate-200" />
        <div className="h-4 w-80 max-w-full rounded-xl bg-slate-100" />
      </div>

      {/* Karten-Placeholder */}
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-36 rounded-2xl border border-slate-200 bg-slate-100"
          />
        ))}
      </div>

      <div className="h-64 rounded-2xl border border-slate-200 bg-slate-100" />
    </div>
  );
}
