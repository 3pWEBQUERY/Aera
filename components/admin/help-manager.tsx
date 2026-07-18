"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  adminSaveHelpCategoryAction,
  adminDeleteHelpCategoryAction,
  adminMoveHelpCategoryAction,
  adminSaveHelpArticleAction,
  adminDeleteHelpArticleAction,
  adminMoveHelpArticleAction,
  type AdminState,
} from "@/app/actions/admin";
import { Sheet } from "@/components/dashboard/sheet";
import { Icon } from "@/components/dashboard/icons";
import { Input, Label, Textarea } from "@/components/ui/field";
import { Pill, FormError, EmptyState } from "@/components/ui/misc";
import { excerpt } from "@/lib/utils";

export interface HelpArticleRow {
  id: string;
  question: string;
  answer: string;
  isPublished: boolean;
}

export interface HelpCategoryRow {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  articles: HelpArticleRow[];
}

const initial: AdminState = {};

type SheetState =
  | { kind: "closed" }
  | { kind: "category"; category: HelpCategoryRow | null }
  | { kind: "article"; categoryId: string; article: HelpArticleRow | null };

/** Platform help-center manager: categories with Q&A articles (public /hilfe). */
export function HelpManager({
  categories,
  locale,
  locales,
}: {
  categories: HelpCategoryRow[];
  locale: string;
  locales: { code: string; label: string }[];
}) {
  const [sheet, setSheet] = useState<SheetState>({ kind: "closed" });
  const [nonce, setNonce] = useState(0);
  const t = useTranslations("admin.help");
  const tc = useTranslations("admin");

  function open(next: SheetState) {
    setNonce((n) => n + 1);
    setSheet(next);
  }
  const close = () => setSheet({ kind: "closed" });

  const total = categories.reduce((sum, c) => sum + c.articles.length, 0);

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-1.5">
        {locales.map((l) => (
          <a
            key={l.code}
            href={`/admin/help?locale=${l.code}`}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              l.code === locale
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {l.label}
          </a>
        ))}
      </div>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Icon name="knowledge" size={20} />
          </span>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{t("title")}</h1>
            <p className="text-sm text-slate-400">
              {t("metaBefore", { categories: categories.length, articles: total })}
              <a href="/hilfe" target="_blank" className="underline underline-offset-2 hover:text-slate-700">
                /hilfe
              </a>
            </p>
          </div>
        </div>
        <button
          onClick={() => open({ kind: "category", category: null })}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98]"
        >
          <Icon name="plus" size={18} />
          {t("createCategory")}
        </button>
      </div>

      {categories.length === 0 ? (
        <EmptyState
          icon="knowledge"
          title={t("emptyTitle")}
          hint={t("emptyHint")}
        >
          <button
            onClick={() => open({ kind: "category", category: null })}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <Icon name="plus" size={18} /> {t("createCategory")}
          </button>
        </EmptyState>
      ) : (
        <div className="space-y-5">
          {categories.map((c, i) => (
            <section key={c.id} className="rounded-2xl border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate font-semibold text-slate-900">{c.title}</h2>
                    <Pill className="bg-slate-100 text-slate-500">
                      {t("articleCount", { count: c.articles.length })}
                    </Pill>
                  </div>
                  {c.description && (
                    <p className="mt-0.5 truncate text-sm text-slate-500">{c.description}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <form action={adminMoveHelpCategoryAction}>
                    <input type="hidden" name="categoryId" value={c.id} />
                    <input type="hidden" name="dir" value="up" />
                    <button
                      disabled={i === 0}
                      aria-label={tc("moveUp")}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30"
                    >
                      <Icon name="chevron" size={15} className="rotate-180" />
                    </button>
                  </form>
                  <form action={adminMoveHelpCategoryAction}>
                    <input type="hidden" name="categoryId" value={c.id} />
                    <input type="hidden" name="dir" value="down" />
                    <button
                      disabled={i === categories.length - 1}
                      aria-label={tc("moveDown")}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30"
                    >
                      <Icon name="chevron" size={15} />
                    </button>
                  </form>
                  <button
                    onClick={() => open({ kind: "category", category: c })}
                    aria-label={t("editCategoryAria")}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
                  >
                    <Icon name="edit" size={15} />
                  </button>
                  <form action={adminDeleteHelpCategoryAction}>
                    <input type="hidden" name="categoryId" value={c.id} />
                    <button
                      aria-label={t("deleteCategoryAria")}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-red-500 transition hover:bg-red-50"
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </form>
                  <button
                    onClick={() => open({ kind: "article", categoryId: c.id, article: null })}
                    className="ml-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    <Icon name="plus" size={15} /> {t("addQuestion")}
                  </button>
                </div>
              </div>

              {c.articles.length === 0 ? (
                <p className="px-5 py-6 text-sm text-slate-400">
                  {t("noQuestions")}
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {c.articles.map((a, j) => (
                    <li key={a.id} className="flex items-start gap-3 px-5 py-3.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-slate-900">{a.question}</p>
                          {!a.isPublished && (
                            <Pill className="bg-amber-100 text-amber-700">{t("draftBadge")}</Pill>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-slate-500">{excerpt(a.answer, 140)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <form action={adminMoveHelpArticleAction}>
                          <input type="hidden" name="articleId" value={a.id} />
                          <input type="hidden" name="dir" value="up" />
                          <button
                            disabled={j === 0}
                            aria-label={tc("moveUp")}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30"
                          >
                            <Icon name="chevron" size={15} className="rotate-180" />
                          </button>
                        </form>
                        <form action={adminMoveHelpArticleAction}>
                          <input type="hidden" name="articleId" value={a.id} />
                          <input type="hidden" name="dir" value="down" />
                          <button
                            disabled={j === c.articles.length - 1}
                            aria-label={tc("moveDown")}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30"
                          >
                            <Icon name="chevron" size={15} />
                          </button>
                        </form>
                        <button
                          onClick={() => open({ kind: "article", categoryId: c.id, article: a })}
                          aria-label={t("editAria")}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
                        >
                          <Icon name="edit" size={15} />
                        </button>
                        <form action={adminDeleteHelpArticleAction}>
                          <input type="hidden" name="articleId" value={a.id} />
                          <button
                            aria-label={t("deleteAria")}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-red-500 transition hover:bg-red-50"
                          >
                            <Icon name="trash" size={15} />
                          </button>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      <Sheet
        open={sheet.kind !== "closed"}
        onClose={close}
        title={
          sheet.kind === "category"
            ? sheet.category
              ? t("editCategoryTitle")
              : t("createCategoryTitle")
            : sheet.kind === "article"
              ? sheet.article
                ? t("editArticleTitle")
                : t("addArticleTitle")
              : ""
        }
        subtitle={t("subtitle")}
        icon="knowledge"
      >
        {sheet.kind === "category" && (
          <CategoryForm key={nonce} category={sheet.category} locale={locale} onDone={close} />
        )}
        {sheet.kind === "article" && (
          <ArticleForm
            key={nonce}
            categoryId={sheet.categoryId}
            categories={categories}
            article={sheet.article}
            onDone={close}
          />
        )}
      </Sheet>
    </div>
  );
}

function FormFooter({
  pending,
  onDone,
  cta,
}: {
  pending: boolean;
  onDone: () => void;
  cta: string;
}) {
  const tc = useTranslations("admin");
  return (
    <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
      <button
        type="button"
        onClick={onDone}
        className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
      >
        {tc("cancel")}
      </button>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50"
      >
        {pending ? tc("savingShort") : cta}
      </button>
    </div>
  );
}

function CategoryForm({
  category,
  locale,
  onDone,
}: {
  category: HelpCategoryRow | null;
  locale: string;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(adminSaveHelpCategoryAction, initial);
  const t = useTranslations("admin.help");
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      {category && <input type="hidden" name="categoryId" value={category.id} />}
      <input type="hidden" name="locale" value={locale} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-5 px-6 py-10">
          <FormError message={state.error} />
          <div>
            <Label htmlFor="hc-title">{t("catTitle")}</Label>
            <Input
              id="hc-title"
              name="title"
              required
              defaultValue={category?.title ?? ""}
              placeholder={t("catTitlePlaceholder")}
              className="text-base"
            />
          </div>
          <div>
            <Label htmlFor="hc-desc">{t("catDesc")}</Label>
            <Textarea
              id="hc-desc"
              name="description"
              rows={2}
              defaultValue={category?.description ?? ""}
              placeholder={t("catDescPlaceholder")}
            />
          </div>
        </div>
      </div>
      <FormFooter
        pending={pending}
        onDone={onDone}
        cta={category ? t("save") : t("createCategory")}
      />
    </form>
  );
}

function ArticleForm({
  categoryId,
  categories,
  article,
  onDone,
}: {
  categoryId: string;
  categories: HelpCategoryRow[];
  article: HelpArticleRow | null;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(adminSaveHelpArticleAction, initial);
  const t = useTranslations("admin.help");
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      {article && <input type="hidden" name="articleId" value={article.id} />}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-5 px-6 py-10">
          <FormError message={state.error} />
          <div>
            <Label htmlFor="ha-cat">{t("category")}</Label>
            <select
              id="ha-cat"
              name="categoryId"
              defaultValue={categoryId}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="ha-q">{t("question")}</Label>
            <Input
              id="ha-q"
              name="question"
              required
              defaultValue={article?.question ?? ""}
              placeholder={t("questionPlaceholder")}
              className="text-base"
            />
          </div>
          <div>
            <Label htmlFor="ha-a">{t("answer")}</Label>
            <Textarea
              id="ha-a"
              name="answer"
              rows={10}
              required
              defaultValue={article?.answer ?? ""}
              placeholder={t("answerPlaceholder")}
            />
          </div>
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4">
            <input
              type="checkbox"
              name="isPublished"
              defaultChecked={article ? article.isPublished : true}
              className="h-4 w-4 accent-slate-900"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-900">
                {t("published")}
              </span>
              <span className="block text-xs text-slate-400">
                {t("publishedHint")}
              </span>
            </span>
          </label>
        </div>
      </div>
      <FormFooter
        pending={pending}
        onDone={onDone}
        cta={article ? t("save") : t("addArticleTitle")}
      />
    </form>
  );
}
