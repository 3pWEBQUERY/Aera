"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  createCourseAction,
  updateCourseAction,
  deleteCourseAction,
  createLessonAction,
  updateLessonAction,
  deleteLessonAction,
  type ActionState,
} from "@/app/actions/dashboard";
import { Sheet } from "./sheet";
import { Icon } from "./icons";
import { ImageUpload } from "./image-upload";
import { VideoUpload } from "./video-upload";
import { Input, Label, Textarea } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Pill, FormError } from "@/components/ui/misc";

export interface LessonData {
  id: string;
  title: string;
  content: string;
  videoUrl: string | null;
  /** Drip-Content: erst N Tage nach Beitritt freigeschaltet (null = sofort). */
  dripAfterDays?: number | null;
}
export interface CourseRowData {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  isPublished: boolean;
  format: string;
  videoUrl: string | null;
  streamUrl: string | null;
  location: string | null;
  address: string | null;
  startsAt: string | Date | null;
  capacity: number | null;
  lessons: LessonData[];
}

const initial: ActionState = {};

function toLocalInput(d: string | Date): string {
  const dt = new Date(d);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}T${p(dt.getHours())}:${p(dt.getMinutes())}`;
}

export function CoursesManager({
  slug,
  courses,
  spaceId,
}: {
  slug: string;
  courses: CourseRowData[];
  spaceId?: string;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = editingId ? courses.find((c) => c.id === editingId) ?? null : null;
  const t = useTranslations("dashboard.courses");

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:mb-7 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t("title")}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {t("subtitle", { count: courses.length })}
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 self-start rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] sm:self-auto"
        >
          <Icon name="plus" size={18} />
          {t("create")}
        </button>
      </div>

      {courses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-16 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <Icon name="courses" size={24} />
          </span>
          <p className="mt-4 font-semibold text-slate-800">{t("emptyTitle")}</p>
          <p className="mt-1 text-sm text-slate-500">{t("emptyHint")}</p>
          <button onClick={() => setCreateOpen(true)} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800">
            <Icon name="plus" size={18} /> {t("create")}
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => (
            <button
              key={c.id}
              onClick={() => setEditingId(c.id)}
              className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left transition hover:border-slate-300 hover:shadow-md"
            >
              <div className="relative flex aspect-[16/9] items-center justify-center overflow-hidden bg-slate-100">
                {c.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.coverUrl} alt={c.title} className="h-full w-full object-cover" />
                ) : (
                  <Icon name="courses" size={30} className="text-slate-300" />
                )}
                {!c.isPublished && (
                  <span className="absolute left-2 top-2 rounded-full bg-slate-900/80 px-2 py-0.5 text-xs font-medium text-white">{t("draft")}</span>
                )}
              </div>
              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-slate-900">{c.title}</p>
                  <Pill className={c.format === "OFFLINE" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}>
                    {c.format === "OFFLINE" ? t("onsite") : t("online")}
                  </Pill>
                </div>
                {c.description && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{c.description}</p>}
                <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-400">
                  {c.format === "OFFLINE" && c.location
                    ? `${c.location} · `
                    : ""}
                  {t("lessonCount", { count: c.lessons.length })}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} title={t("sheetCreateTitle")} subtitle={t("sheetCreateSubtitle")} icon="courses">
        <CourseForm slug={slug} spaceId={spaceId} onDone={() => setCreateOpen(false)} />
      </Sheet>
      <Sheet open={!!editing} onClose={() => setEditingId(null)} title={t("sheetEditTitle")} subtitle={editing?.title} icon="courses">
        {editing && <CourseForm key={editing.id} slug={slug} course={editing} onDone={() => setEditingId(null)} />}
      </Sheet>
    </div>
  );
}

function CourseForm({
  slug,
  course,
  spaceId,
  onDone,
}: {
  slug: string;
  course?: CourseRowData;
  spaceId?: string;
  onDone: () => void;
}) {
  const isEdit = !!course;
  const [state, action, pending] = useActionState(isEdit ? updateCourseAction : createCourseAction, initial);
  const [deleting, setDeleting] = useState(false);
  const [format, setFormat] = useState(course?.format ?? "ONLINE");
  const formId = `course-form-${course?.id ?? "new"}`;
  const t = useTranslations("dashboard.courses");

  useEffect(() => {
    if (state.ok && !isEdit) onDone();
  }, [state.ok, isEdit, onDone]);

  async function onDelete() {
    if (!course) return;
    if (!confirm(t("confirmDeleteCourse", { title: course.title }))) return;
    setDeleting(true);
    const fd = new FormData();
    fd.set("tenant", slug);
    fd.set("courseId", course.id);
    await deleteCourseAction(fd);
    onDone();
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl px-6 py-10">
          <form id={formId} action={action} className="space-y-6">
            <input type="hidden" name="tenant" value={slug} />
            {spaceId && !isEdit && <input type="hidden" name="spaceId" value={spaceId} />}
            <input type="hidden" name="format" value={format} />
            {isEdit && <input type="hidden" name="courseId" value={course!.id} />}
            <FormError message={state.error} />
            <div>
              <Label>{t("coverLabel")}</Label>
              <ImageUpload tenant={slug} purpose="course-cover" defaultUrl={course?.coverUrl} />
            </div>
            <div>
              <Label htmlFor="cf-title">{t("titleLabel")}</Label>
              <Input id="cf-title" name="title" required defaultValue={course?.title} className="text-base" />
            </div>
            <div>
              <Label htmlFor="cf-desc">{t("descLabel")}</Label>
              <Textarea id="cf-desc" name="description" rows={3} defaultValue={course?.description ?? undefined} />
            </div>

            <div>
              <p className="mb-3 text-sm font-medium text-slate-700">{t("format")}</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { v: "ONLINE", label: t("online"), desc: t("onlineDesc"), icon: "videos" as const },
                  { v: "OFFLINE", label: t("onsite"), desc: t("onsiteDesc"), icon: "events" as const },
                ].map((o) => {
                  const sel = o.v === format;
                  return (
                    <button
                      key={o.v}
                      type="button"
                      onClick={() => setFormat(o.v)}
                      className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors duration-200 ${sel ? "border-black bg-slate-50" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"}`}
                    >
                      <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${sel ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}>
                        <Icon name={o.icon} size={18} />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-slate-900">{o.label}</span>
                        <span className="block text-xs text-slate-400">{o.desc}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {format === "ONLINE" ? (
              <div className="space-y-4 rounded-2xl bg-slate-50 p-4">
                <div>
                  <Label>{t("videoLabel")}</Label>
                  <VideoUpload tenant={slug} name="videoUrl" purpose="course-video" defaultUrl={course?.videoUrl} />
                </div>
                <div>
                  <Label htmlFor="cf-stream">{t("streamLabel")}</Label>
                  <Input id="cf-stream" name="streamUrl" type="url" defaultValue={course?.streamUrl ?? ""} placeholder={t("streamPlaceholder")} />
                </div>
                <p className="text-xs text-slate-400">{t("onlineHint")}</p>
              </div>
            ) : (
              <div className="space-y-4 rounded-2xl bg-slate-50 p-4">
                <div>
                  <Label htmlFor="cf-loc">{t("locationLabel")}</Label>
                  <Input id="cf-loc" name="location" defaultValue={course?.location ?? ""} placeholder={t("locationPlaceholder")} />
                </div>
                <div>
                  <Label htmlFor="cf-addr">{t("addressLabel")}</Label>
                  <Input id="cf-addr" name="address" defaultValue={course?.address ?? ""} placeholder={t("addressPlaceholder")} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="cf-start">{t("dateLabel")}</Label>
                    <Input id="cf-start" name="startsAt" type="datetime-local" defaultValue={course?.startsAt ? toLocalInput(course.startsAt) : undefined} />
                  </div>
                  <div>
                    <Label htmlFor="cf-cap">{t("seatsLabel")}</Label>
                    <Input id="cf-cap" name="capacity" type="number" min={0} defaultValue={course?.capacity ?? undefined} placeholder={t("seatsPlaceholder")} />
                  </div>
                </div>
              </div>
            )}

            <Switch name="isPublished" defaultChecked={course ? course.isPublished : true} label={t("publishedLabel")} hint={t("publishedHint")} />
            {isEdit && (
              <div className="flex justify-end">
                <button type="submit" disabled={pending} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200 disabled:opacity-50">
                  {pending ? t("savingCourse") : t("saveCourseData")}
                </button>
              </div>
            )}
          </form>

          {isEdit && (
            <div className="mt-8 border-t border-slate-100 pt-6">
              <h3 className="mb-3 text-sm font-semibold text-slate-800">{t("lessons")}</h3>
              <div className="space-y-2">
                {course!.lessons.map((l) => (
                  <LessonRow key={l.id} slug={slug} lesson={l} />
                ))}
                {course!.lessons.length === 0 && (
                  <p className="text-sm text-slate-400">{t("noLessons")}</p>
                )}
              </div>
              <AddLesson slug={slug} courseId={course!.id} />
            </div>
          )}

          {isEdit && (
            <div className="mt-8 border-t border-slate-100 pt-6">
              <button type="button" onClick={onDelete} disabled={deleting} className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50">
                <Icon name="archive" size={16} />
                {deleting ? t("deletingCourse") : t("deleteCourse")}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
        <button type="button" onClick={onDone} className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100">
          {isEdit ? t("close") : t("cancel")}
        </button>
        {!isEdit && (
          <button type="submit" form={formId} disabled={pending} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50">
            {pending ? t("creating") : t("create")}
          </button>
        )}
      </div>
    </>
  );
}

function LessonRow({ slug, lesson }: { slug: string; lesson: LessonData }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(updateLessonAction, initial);
  const [deleting, setDeleting] = useState(false);
  const t = useTranslations("dashboard.courses");
  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state.ok]);

  async function onDelete() {
    if (!confirm(t("confirmDeleteLesson", { title: lesson.title }))) return;
    setDeleting(true);
    const fd = new FormData();
    fd.set("tenant", slug);
    fd.set("lessonId", lesson.id);
    await deleteLessonAction(fd);
  }

  return (
    <div className="rounded-xl border border-slate-200">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <Icon name="courses" size={16} className="text-slate-400" />
        <span className="flex-1 truncate text-sm font-medium text-slate-800">{lesson.title}</span>
        {lesson.videoUrl && <Pill className="bg-slate-100 text-slate-500">{t("videoBadge")}</Pill>}
        {(lesson.dripAfterDays ?? 0) > 0 && (
          <Pill className="bg-amber-50 text-amber-700">{t("dripBadge", { days: lesson.dripAfterDays ?? 0 })}</Pill>
        )}
        <button type="button" onClick={() => setOpen((v) => !v)} className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100">
          {open ? t("closeLesson") : t("editLesson")}
        </button>
        <button type="button" onClick={onDelete} disabled={deleting} className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
          {t("deleteLesson")}
        </button>
      </div>
      {open && (
        <form action={action} className="space-y-3 border-t border-slate-100 p-3">
          <input type="hidden" name="tenant" value={slug} />
          <input type="hidden" name="lessonId" value={lesson.id} />
          <Input name="title" required defaultValue={lesson.title} placeholder={t("lessonTitlePlaceholder")} />
          <Input name="videoUrl" type="url" defaultValue={lesson.videoUrl ?? ""} placeholder={t("videoUrlPlaceholder")} />
          <Textarea name="content" rows={3} defaultValue={lesson.content} placeholder={t("contentPlaceholder")} />
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              {t("dripLabel")}
            </label>
            <Input
              name="dripAfterDays"
              type="number"
              min={0}
              max={365}
              defaultValue={lesson.dripAfterDays ?? ""}
              placeholder={t("dripPlaceholder")}
              className="w-32"
            />
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={pending} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50">
              {pending ? t("lessonSaving") : t("lessonSave")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function AddLesson({ slug, courseId }: { slug: string; courseId: string }) {
  const [state, action, pending] = useActionState(createLessonAction, initial);
  const ref = useRef<HTMLFormElement>(null);
  const t = useTranslations("dashboard.courses");
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state.ok]);

  return (
    <form ref={ref} action={action} className="mt-4 space-y-3 rounded-xl border border-dashed border-slate-300 p-3">
      <input type="hidden" name="tenant" value={slug} />
      <input type="hidden" name="courseId" value={courseId} />
      <p className="text-sm font-medium text-slate-700">{t("addLesson")}</p>
      <FormError message={state.error} />
      <Input name="title" required placeholder={t("addLessonTitlePlaceholder")} />
      <Input name="videoUrl" type="url" placeholder={t("videoUrlPlaceholder")} />
      <Textarea name="content" rows={2} placeholder={t("addContentPlaceholder")} />
      <Input
        name="dripAfterDays"
        type="number"
        min={0}
        max={365}
        placeholder={t("addDripPlaceholder")}
      />
      <div className="flex justify-end">
        <button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200 disabled:opacity-50">
          <Icon name="plus" size={16} />
          {pending ? t("adding") : t("add")}
        </button>
      </div>
    </form>
  );
}
