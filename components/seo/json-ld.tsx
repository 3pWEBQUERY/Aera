import { headers } from "next/headers";
import { serializeJsonLd, type JsonLdObject } from "@/lib/json-ld";

/**
 * Strukturierte Daten (schema.org) als `<script type="application/ld+json">`.
 *
 * Der Inhalt laeuft durch serializeJsonLd: `<`, `>` und `&` werden als
 * \u-Escapes geschrieben, damit ein Titel wie `</script><script>…` den Block
 * nicht verlassen kann. Ein Datenblock wird vom Browser nicht ausgefuehrt und
 * faellt deshalb nicht unter script-src; die Nonce aus proxy.ts traegt er
 * trotzdem, damit er auch unter einer strengeren Richtlinie stehen bleibt.
 *
 * Nur fuer oeffentliche Inhalte verwenden — was hier steht, liest jeder.
 */
export async function JsonLd({ data }: { data: JsonLdObject | JsonLdObject[] }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      // eslint-disable-next-line react/no-danger -- escaped by serializeJsonLd
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
