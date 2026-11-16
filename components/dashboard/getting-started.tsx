import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, CardBody } from "@/components/ui/card";
import { Icon } from "@/components/dashboard/icons";

export interface GettingStartedTask {
  key: "post" | "look" | "invite";
  done: boolean;
  href: string;
}

/**
 * First-run guide on the dashboard overview.
 *
 * A new creator lands here right after the wizard; without it the most
 * prominent element was the upgrade card and the way to the first post was
 * hidden among twenty navigation items. Each task is derived from real data,
 * so it ticks itself off; the card disappears once everything is done.
 */
export async function GettingStarted({
  tasks,
  communityHref,
}: {
  tasks: GettingStartedTask[];
  communityHref: string;
}) {
  const t = await getTranslations("dashboard.gettingStarted");
  const done = tasks.filter((task) => task.done).length;
  if (done === tasks.length) return null;
  const next = tasks.find((task) => !task.done);

  return (
    <Card className="mb-6">
      <CardBody>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">{t("title")}</h2>
          <p className="text-sm text-slate-500">{t("progress", { done, total: tasks.length })}</p>
        </div>
        <div
          className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-label={t("title")}
          aria-valuemin={0}
          aria-valuemax={tasks.length}
          aria-valuenow={done}
        >
          <div
            className="h-full rounded-full bg-[var(--action-strong,#9c85d6)] transition-all"
            style={{ width: `${(done / tasks.length) * 100}%` }}
          />
        </div>
        <ol className="mt-4 divide-y divide-slate-100">
          {tasks.map((task) => (
            <li key={task.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 sm:flex-nowrap">
              <span
                className={
                  task.done
                    ? "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
                    : "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-300 text-slate-500"
                }
                aria-hidden
              >
                {task.done && <Icon name="check" size={14} />}
              </span>
              <div className="min-w-[12rem] flex-1">
                <p className={task.done ? "text-sm font-medium text-slate-500 line-through" : "text-sm font-medium text-slate-900"}>
                  {t(`${task.key}.title`)}
                  {task.done && <span className="sr-only"> – {t("done")}</span>}
                </p>
                {!task.done && <p className="text-sm text-slate-500">{t(`${task.key}.desc`)}</p>}
              </div>
              {!task.done && (
                <Link
                  href={task.href}
                  className={
                    task === next
                      ? "ml-10 inline-flex min-h-10 sm:ml-0 items-center rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-[var(--primary-fg)] hover:bg-[var(--primary-hover)]"
                      : "ml-10 inline-flex min-h-10 items-center rounded-xl border sm:ml-0 border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  }
                >
                  {t(`${task.key}.cta`)}
                </Link>
              )}
            </li>
          ))}
        </ol>
        <p className="mt-2 text-sm text-slate-500">
          <Link href={communityHref} className="font-medium text-slate-700 underline underline-offset-2 hover:text-slate-900">
            {t("viewCommunity")}
          </Link>{" "}
          – {t("viewCommunityHint")}
        </p>
      </CardBody>
    </Card>
  );
}
