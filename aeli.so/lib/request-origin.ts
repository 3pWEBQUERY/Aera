/**
 * Kam diese Anfrage von einer Seite auf demselben Host?
 *
 * Für die schmalen POST-Routen der öffentlichen Seite (Leads). Sie haben
 * keine Sitzung und kein CSRF-Token — ohne diese Prüfung könnte jede fremde
 * Website Formulare in fremde Listen abschicken, im Namen ihrer Besucher.
 *
 * Zwei Signale, beide vom Browser gesetzt und für Seiten nicht fälschbar:
 *   * `Sec-Fetch-Site` muss `same-origin` sein, falls vorhanden. `same-site`
 *     reicht nicht: `anna.aeli.so` und `bert.aeli.so` sind dieselbe Site,
 *     aber verschiedene Seiten.
 *   * `Origin` muss vorhanden sein und auf denselben Host zeigen. Ein Browser
 *     schickt ihn bei jedem `fetch`-POST mit.
 *
 * Ein Skript außerhalb des Browsers kann beides setzen, wie es will — dafür
 * gibt es die Ratenbegrenzung. Hier geht es um fremde Seiten.
 *
 * Rein, ohne Next-Importe, damit der Test sie direkt aufrufen kann.
 */
export function isSameOriginRequest(headers: Pick<Headers, "get">): boolean {
  const site = headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;

  const origin = headers.get("origin");
  if (!origin || origin === "null") return false;

  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }

  const hosts = [headers.get("x-forwarded-host"), headers.get("host")]
    .flatMap((value) => (value ?? "").split(","))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return hosts.includes(originHost);
}

/** `application/json`, auch mit `; charset=utf-8`. */
export function isJsonRequest(headers: Pick<Headers, "get">): boolean {
  const type = (headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  return type === "application/json";
}
