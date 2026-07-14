import type { MetadataRoute } from "next";
import { getTranslations } from "next-intl/server";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const t = await getTranslations("uiMigration.auth");
  return {
    name: "Aera",
    short_name: "Aera",
    description: t("manifestDescription"),
    start_url: "/home",
    display: "standalone",
    background_color: "#f4f1ea",
    theme_color: "#161613",
    icons: [
      {
        src: "/logo.svg",
        sizes: "any",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
