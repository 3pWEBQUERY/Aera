const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 3;

function isLocalOrPrivateHost(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".railway.internal")
  );
}

function sameConfiguredDomain(left, right) {
  const withoutWww = (hostname) => hostname.replace(/^www\./i, "").toLowerCase();
  return withoutWww(left) === withoutWww(right);
}

function normalizedPath(pathname) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

/**
 * Parse the cron target before attaching the bearer secret. Public HTTP URLs
 * are upgraded locally so the secret is never sent to a clear-text endpoint
 * merely to be redirected to HTTPS.
 */
export function normalizeCronBase(rawValue) {
  const value = rawValue.trim();
  if (!value) throw new Error("CRON_TARGET_URL (or APP_URL) is missing");

  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(withScheme);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new Error(
      "CRON_TARGET_URL (or APP_URL) must be an HTTP(S) origin without credentials or a path",
    );
  }

  if (url.protocol === "http:" && !isLocalOrPrivateHost(url.hostname)) {
    url.protocol = "https:";
    url.port = "";
  }

  return url.origin;
}

/**
 * Fetch does not preserve POST for every redirect status. Cron endpoints reject
 * GET by design, so follow only tightly constrained redirects and explicitly
 * issue the authenticated POST again. This also prevents a redirect from
 * forwarding CRON_SECRET to an unrelated host or path.
 */
export async function postCronRequest(urlValue, secret, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const initial = new URL(urlValue);
  const expectedPath = normalizedPath(initial.pathname);
  let current = initial;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetchImpl(current, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${secret}`,
      },
      redirect: "manual",
      signal: options.signal,
    });

    if (!REDIRECT_STATUSES.has(response.status)) {
      return { response, finalUrl: current, redirects: redirectCount };
    }

    const location = response.headers.get("location");
    if (!location) {
      throw new Error(`cron target returned ${response.status} without Location`);
    }
    if (redirectCount === MAX_REDIRECTS) {
      throw new Error(`cron target exceeded ${MAX_REDIRECTS} redirects`);
    }

    const next = new URL(location, current);
    const staysPrivateHttp =
      next.protocol === "http:" && isLocalOrPrivateHost(next.hostname);
    const safeProtocol = next.protocol === "https:" || staysPrivateHttp;
    const safeHost = sameConfiguredDomain(initial.hostname, next.hostname);
    const safePath = normalizedPath(next.pathname) === expectedPath;

    if (
      !safeProtocol ||
      !safeHost ||
      !safePath ||
      next.username ||
      next.password ||
      next.search ||
      next.hash
    ) {
      throw new Error(
        `unsafe cron redirect rejected (${response.status} to ${next.origin}${next.pathname})`,
      );
    }

    current = next;
  }

  throw new Error("unreachable cron redirect state");
}
