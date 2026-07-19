"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/field";
import { FormError } from "@/components/ui/misc";
import { useTranslations } from "next-intl";
import {
  createCommunityAction,
  type CommunityState,
} from "@/app/actions/community";

const initial: CommunityState = {};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function CommunityForm({ rootDomain }: { rootDomain: string }) {
  const t = useTranslations("uiMigration.auth");
  const [state, action, pending] = useActionState(
    createCommunityAction,
    initial,
  );
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [touched, setTouched] = useState(false);
  const effectiveSlug = touched ? slug : slugify(name);

  return (
    <form action={action} aria-describedby={state.error ? "community-form-error" : undefined} className="space-y-5">
      <FormError id="community-form-error" message={state.error} />
      <div>
        <Label htmlFor="name">{t("communityName")}</Label>
        <Input
          id="name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("communityNamePlaceholder")}
          aria-invalid={state.error ? true : undefined}
          required
        />
      </div>
      <div>
        <Label htmlFor="slug">{t("address")}</Label>
        <div className="flex items-center overflow-hidden rounded-lg border border-slate-300 focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-200">
          <input
            id="slug"
            name="slug"
            value={effectiveSlug}
            onChange={(e) => {
              setTouched(true);
              setSlug(slugify(e.target.value));
            }}
            className="min-w-0 flex-1 px-3 py-2 text-sm outline-none"
            placeholder="maker-studio"
            aria-invalid={state.error ? true : undefined}
            required
          />
          <span className="shrink-0 bg-slate-50 px-3 py-2 text-sm text-slate-500">
            .{rootDomain}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {t("alsoAvailable", { slug: effectiveSlug || t("defaultCommunitySlug") })}
        </p>
      </div>
      <div>
        <Label htmlFor="tagline">{t("taglineOptional")}</Label>
        <Textarea
          id="tagline"
          name="tagline"
          rows={2}
          maxLength={140}
          placeholder={t("taglinePlaceholder")}
          aria-invalid={state.error ? true : undefined}
        />
      </div>
      <Button
        type="submit"
        variant="brand"
        size="lg"
        className="w-full"
        disabled={pending}
      >
        {pending ? t("creatingCommunity") : t("createCommunity")}
      </Button>
    </form>
  );
}
