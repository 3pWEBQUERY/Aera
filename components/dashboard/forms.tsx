"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { FormError } from "@/components/ui/misc";
import { PricePointSelect } from "./price-point-select";
import { useNameAvailability, NameStatusHint } from "./use-name-availability";
import { useTranslations } from "next-intl";
import {
  createSpaceAction,
  createTierAction,
  createProductAction,
  createCourseAction,
  createLessonAction,
  createEventAction,
  createCampaignAction,
  createSegmentAction,
  createBadgeAction,
  updateBrandingAction,
  type ActionState,
} from "@/app/actions/dashboard";

const initial: ActionState = {};

function useResetOnOk(ok?: boolean) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (ok) ref.current?.reset();
  }, [ok]);
  return ref;
}

export function SpaceForm({ slug }: { slug: string }) {
  const t = useTranslations("uiMigration.legacyForms");
  const [state, action, pending] = useActionState(createSpaceAction, initial);
  const ref = useResetOnOk(state.ok);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <input type="hidden" name="tenant" value={slug} />
      <FormError message={state.error} />
      <div>
        <Label htmlFor="sp-name">{t("name")}</Label>
        <Input id="sp-name" name="name" required placeholder={t("spacePlaceholder")} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="sp-type">{t("type")}</Label>
          <Select id="sp-type" name="type" defaultValue="FEED">
            <option value="FEED">{t("feed")}</option>
            <option value="FORUM">{t("forum")}</option>
            <option value="COURSE">{t("course")}</option>
            <option value="SHOP">{t("shop")}</option>
            <option value="NEWSLETTER">{t("newsletter")}</option>
            <option value="EVENTS">{t("events")}</option>
            <option value="BLOG">{t("blog")}</option>
            <option value="KNOWLEDGE">{t("knowledge")}</option>
            <option value="GALLERY">{t("gallery")}</option>
            <option value="VIDEOS">{t("videos")}</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="sp-vis">{t("visibility")}</Label>
          <Select id="sp-vis" name="visibility" defaultValue="MEMBERS">
            <option value="PUBLIC">{t("public")}</option>
            <option value="MEMBERS">{t("membersOnly")}</option>
            <option value="PAID">{t("paid")}</option>
          </Select>
        </div>
      </div>
      <div>
        <Label htmlFor="sp-key">{t("entitlementOptional")}</Label>
        <Input id="sp-key" name="requiredEntitlementKey" placeholder="tier:premium" />
      </div>
      <div>
        <Label htmlFor="sp-desc">{t("description")}</Label>
        <Textarea id="sp-desc" name="description" rows={2} />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? t("saving") : t("createSpace")}
      </Button>
    </form>
  );
}

export function TierForm({ slug }: { slug: string }) {
  const t = useTranslations("uiMigration.legacyForms");
  const [state, action, pending] = useActionState(createTierAction, initial);
  const ref = useResetOnOk(state.ok);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <input type="hidden" name="tenant" value={slug} />
      <FormError message={state.error} />
      <div>
        <Label htmlFor="t-name">{t("name")}</Label>
        <Input id="t-name" name="name" required placeholder={t("tierPlaceholder")} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="t-interval">{t("billing")}</Label>
          <Select id="t-interval" name="interval" defaultValue="MONTH">
            <option value="FREE">{t("free")}</option>
            <option value="MONTH">{t("monthly")}</option>
            <option value="YEAR">{t("yearly")}</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="t-price">{t("priceCents")}</Label>
          <PricePointSelect id="t-price" name="priceCents" kind="subscription" allowFree />
        </div>
      </div>
      <div>
        <Label htmlFor="t-desc">{t("description")}</Label>
        <Textarea id="t-desc" name="description" rows={2} />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? t("saving") : t("createTier")}
      </Button>
    </form>
  );
}

export function ProductForm({ slug }: { slug: string }) {
  const t = useTranslations("uiMigration.legacyForms");
  const [state, action, pending] = useActionState(createProductAction, initial);
  const ref = useResetOnOk(state.ok);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <input type="hidden" name="tenant" value={slug} />
      <FormError message={state.error} />
      <div>
        <Label htmlFor="p-name">{t("name")}</Label>
        <Input id="p-name" name="name" required placeholder={t("productPlaceholder")} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="p-type">{t("type")}</Label>
          <Select id="p-type" name="type" defaultValue="DIGITAL">
            <option value="DIGITAL">{t("digitalProduct")}</option>
            <option value="BUNDLE">{t("bundle")}</option>
            <option value="COURSE_ACCESS">{t("courseAccess")}</option>
            <option value="TIER_GRANT">{t("tierUnlock")}</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="p-price">{t("priceCents")}</Label>
          <PricePointSelect id="p-price" name="priceCents" kind="oneTime" allowFree />
        </div>
      </div>
      <div>
        <Label htmlFor="p-url">{t("downloadOptional")}</Label>
        <Input id="p-url" name="downloadUrl" type="url" placeholder="https://…" />
      </div>
      <div>
        <Label htmlFor="p-desc">{t("description")}</Label>
        <Textarea id="p-desc" name="description" rows={2} />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? t("saving") : t("createProduct")}
      </Button>
    </form>
  );
}

export function CourseForm({
  slug,
  spaces,
}: {
  slug: string;
  spaces: { id: string; name: string }[];
}) {
  const t = useTranslations("uiMigration.legacyForms");
  const [state, action, pending] = useActionState(createCourseAction, initial);
  const ref = useResetOnOk(state.ok);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <input type="hidden" name="tenant" value={slug} />
      <FormError message={state.error} />
      <div>
        <Label htmlFor="c-title">{t("courseTitle")}</Label>
        <Input id="c-title" name="title" required />
      </div>
      <div>
        <Label htmlFor="c-space">{t("courseSpace")}</Label>
        <Select id="c-space" name="spaceId" required>
          {spaces.length === 0 && <option value="">{t("createCourseSpaceFirst")}</option>}
          {spaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="c-desc">{t("description")}</Label>
        <Textarea id="c-desc" name="description" rows={2} />
      </div>
      <Button type="submit" disabled={pending || spaces.length === 0}>
        {pending ? t("saving") : t("createCourse")}
      </Button>
    </form>
  );
}

export function LessonForm({
  slug,
  courses,
}: {
  slug: string;
  courses: { id: string; title: string }[];
}) {
  const t = useTranslations("uiMigration.legacyForms");
  const [state, action, pending] = useActionState(createLessonAction, initial);
  const ref = useResetOnOk(state.ok);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <input type="hidden" name="tenant" value={slug} />
      <FormError message={state.error} />
      <div>
        <Label htmlFor="l-course">{t("course")}</Label>
        <Select id="l-course" name="courseId" required>
          {courses.length === 0 && <option value="">{t("createCourseFirst")}</option>}
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="l-title">{t("lessonTitle")}</Label>
        <Input id="l-title" name="title" required />
      </div>
      <div>
        <Label htmlFor="l-video">{t("videoOptional")}</Label>
        <Input id="l-video" name="videoUrl" type="url" placeholder="https://…" />
      </div>
      <div>
        <Label htmlFor="l-content">{t("content")}</Label>
        <Textarea id="l-content" name="content" rows={3} />
      </div>
      <Button type="submit" disabled={pending || courses.length === 0}>
        {pending ? t("saving") : t("addLesson")}
      </Button>
    </form>
  );
}

export function EventForm({ slug }: { slug: string }) {
  const t = useTranslations("uiMigration.legacyForms");
  const [state, action, pending] = useActionState(createEventAction, initial);
  const ref = useResetOnOk(state.ok);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <input type="hidden" name="tenant" value={slug} />
      <FormError message={state.error} />
      <div>
        <Label htmlFor="e-title">{t("title")}</Label>
        <Input id="e-title" name="title" required />
      </div>
      <div>
        <Label htmlFor="e-start">{t("start")}</Label>
        <Input id="e-start" name="startsAt" type="datetime-local" required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="e-online">{t("format")}</Label>
          <Select id="e-online" name="isOnline" defaultValue="true">
            <option value="true">{t("online")}</option>
            <option value="">{t("onsite")}</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="e-loc">{t("location")}</Label>
          <Input id="e-loc" name="location" placeholder="Berlin / Zoom" />
        </div>
      </div>
      <div>
        <Label htmlFor="e-url">{t("meetingOptional")}</Label>
        <Input id="e-url" name="meetingUrl" type="url" placeholder="https://…" />
      </div>
      <div>
        <Label htmlFor="e-desc">{t("description")}</Label>
        <Textarea id="e-desc" name="description" rows={2} />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? t("saving") : t("createEvent")}
      </Button>
    </form>
  );
}

export function CampaignForm({
  slug,
  segments,
}: {
  slug: string;
  segments: { id: string; name: string }[];
}) {
  const t = useTranslations("uiMigration.legacyForms");
  const [state, action, pending] = useActionState(createCampaignAction, initial);
  const ref = useResetOnOk(state.ok);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <input type="hidden" name="tenant" value={slug} />
      <FormError message={state.error} />
      <div>
        <Label htmlFor="n-subject">{t("subject")}</Label>
        <Input id="n-subject" name="subject" required />
      </div>
      <div>
        <Label htmlFor="n-seg">{t("segment")}</Label>
        <Select id="n-seg" name="segmentId" defaultValue="">
          <option value="">{t("allActiveMembers")}</option>
          {segments.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="n-body">{t("content")}</Label>
        <Textarea id="n-body" name="body" rows={6} required />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? t("saving") : t("saveDraft")}
      </Button>
    </form>
  );
}

export function SegmentForm({
  slug,
  tiers,
}: {
  slug: string;
  tiers: { slug: string; name: string }[];
}) {
  const t = useTranslations("uiMigration.legacyForms");
  const [state, action, pending] = useActionState(createSegmentAction, initial);
  const ref = useResetOnOk(state.ok);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <input type="hidden" name="tenant" value={slug} />
      <FormError message={state.error} />
      <div>
        <Label htmlFor="seg-name">{t("name")}</Label>
        <Input id="seg-name" name="name" required placeholder={t("segmentPlaceholder")} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="seg-tier">{t("tier")}</Label>
          <Select id="seg-tier" name="tierSlug" defaultValue="">
            <option value="">{t("allTiers")}</option>
            {tiers.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="seg-pts">{t("minPoints")}</Label>
          <Input id="seg-pts" name="minPoints" type="number" min={0} defaultValue={0} />
        </div>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? t("saving") : t("createSegment")}
      </Button>
    </form>
  );
}

export function BadgeForm({ slug }: { slug: string }) {
  const t = useTranslations("uiMigration.legacyForms");
  const [state, action, pending] = useActionState(createBadgeAction, initial);
  const ref = useResetOnOk(state.ok);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <input type="hidden" name="tenant" value={slug} />
      <FormError message={state.error} />
      <div>
        <Label htmlFor="b-name">{t("name")}</Label>
        <Input id="b-name" name="name" required placeholder={t("badgePlaceholder")} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="b-type">{t("criterion")}</Label>
          <Select id="b-type" name="type" defaultValue="points">
            <option value="points">{t("points")}</option>
            <option value="posts">{t("posts")}</option>
            <option value="comments">{t("comments")}</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="b-th">{t("threshold")}</Label>
          <Input id="b-th" name="threshold" type="number" min={1} defaultValue={10} />
        </div>
      </div>
      <div>
        <Label htmlFor="b-desc">{t("description")}</Label>
        <Input id="b-desc" name="description" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? t("saving") : t("createBadge")}
      </Button>
    </form>
  );
}

export function BrandingForm({
  slug,
  tenant,
}: {
  slug: string;
  tenant: {
    name: string;
    tagline: string | null;
    description: string | null;
    logoUrl: string | null;
    primaryColor: string;
    accentColor: string;
  };
}) {
  const t = useTranslations("uiMigration.legacyForms");
  const [state, action, pending] = useActionState(updateBrandingAction, initial);
  const [name, setName] = useState(tenant.name);
  const nameCheck = useNameAvailability(name, slug);
  const nameBlocks = nameCheck === "taken" || nameCheck === "long";
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="tenant" value={slug} />
      <FormError message={state.error} />
      {state.ok && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          {t("brandingSaved")}
        </p>
      )}
      <div>
        <Label htmlFor="br-name">{t("name")}</Label>
        <Input
          id="br-name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <NameStatusHint status={nameCheck} />
      </div>
      <div>
        <Label htmlFor="br-tag">{t("tagline")}</Label>
        <Input id="br-tag" name="tagline" defaultValue={tenant.tagline ?? ""} />
      </div>
      <div>
        <Label htmlFor="br-desc">{t("description")}</Label>
        <Textarea id="br-desc" name="description" rows={3} defaultValue={tenant.description ?? ""} />
      </div>
      <div>
        <Label htmlFor="br-logo">{t("logoUrl")}</Label>
        <Input id="br-logo" name="logoUrl" type="url" defaultValue={tenant.logoUrl ?? ""} placeholder="https://…" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
        <Label htmlFor="br-primary">{t("primaryColor")}</Label>
          <Input id="br-primary" name="primaryColor" type="color" defaultValue={tenant.primaryColor} className="h-10 p-1" />
        </div>
        <div>
          <Label htmlFor="br-accent">{t("accentColor")}</Label>
          <Input id="br-accent" name="accentColor" type="color" defaultValue={tenant.accentColor} className="h-10 p-1" />
        </div>
      </div>
      <Button type="submit" disabled={pending || nameBlocks}>
        {pending ? t("saving") : t("saveBranding")}
      </Button>
    </form>
  );
}
