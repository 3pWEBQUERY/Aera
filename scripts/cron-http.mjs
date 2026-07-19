const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 3;
const DEFAULT_NETWORK_RETRIES = 1;
const DEFAULT_RETRY_DELAY_MS = 250;

const DNS_CODES = new Set(["EAI_AGAIN", "ENOTFOUND"]);
const TIMEOUT_CODES = new Set([
  "ETIMEDOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
]);
const CONNECTION_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "UND_ERR_CONNECT",
  "UND_ERR_SOCKET",
]);
const ABORT_CODES = new Set(["ABORT_ERR", "ERR_ABORTED", "UND_ERR_ABORTED"]);
const TLS_CODES = new Set([
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE",
  "ERR_SSL_WRONG_VERSION_NUMBER",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "ERR_TLS_HANDSHAKE_TIMEOUT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
]);
const TRANSIENT_CODES = new Set([
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "ETIMEDOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_CONNECT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);

function isKnownNetworkCode(code) {
  return (
    DNS_CODES.has(code) ||
    TIMEOUT_CODES.has(code) ||
    CONNECTION_CODES.has(code) ||
    ABORT_CODES.has(code) ||
    TLS_CODES.has(code)
  );
}

function safeErrorProperty(error, property) {
  try {
    return Reflect.get(error, property);
  } catch {
    return undefined;
  }
}

function collectErrorCodes(error) {
  const codes = new Set();
  const visited = new Set();
  const queue = [error];

  while (queue.length > 0 && visited.size < 16) {
    const current = queue.shift();
    if ((typeof current !== "object" && typeof current !== "function") || current === null) {
      continue;
    }
    if (visited.has(current)) continue;
    visited.add(current);

    const code = safeErrorProperty(current, "code");
    if (
      typeof code === "string" &&
      /^[A-Z][A-Z0-9_]{1,63}$/.test(code) &&
      isKnownNetworkCode(code)
    ) {
      codes.add(code);
    }
    if (safeErrorProperty(current, "name") === "AbortError") {
      codes.add("ABORT_ERR");
    }

    const cause = safeErrorProperty(current, "cause");
    if (cause !== undefined) queue.push(cause);
    const errors = safeErrorProperty(current, "errors");
    if (Array.isArray(errors)) queue.push(...errors.slice(0, 8));
  }

  return [...codes].slice(0, 8);
}

/**
 * Return an allow-listed diagnosis only. Raw nested error messages can contain
 * request details, so they must never be written to Railway logs.
 */
export function classifyCronRequestError(error) {
  const codes = collectErrorCodes(error);
  const has = (set) => codes.some((code) => set.has(code));
  const hasTls = has(TLS_CODES);
  const aborted = has(ABORT_CODES);

  let category = "unknown";
  if (aborted) category = "aborted";
  else if (hasTls) category = "tls";
  else if (has(TIMEOUT_CODES)) category = "timeout";
  else if (has(DNS_CODES)) category = "dns";
  else if (has(CONNECTION_CODES)) category = "connection";

  return {
    category,
    codes,
    retryable:
      !aborted && !hasTls && codes.some((code) => TRANSIENT_CODES.has(code)),
  };
}

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

function effectivePort(url) {
  if (url.port) return url.port;
  return url.protocol === "https:" ? "443" : "80";
}

function isSafeRedirectOrigin(initial, next) {
  return (
    next.protocol === initial.protocol &&
    effectivePort(next) === effectivePort(initial) &&
    sameConfiguredDomain(initial.hostname, next.hostname)
  );
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
  if (value.includes("${{") || value.includes("}}")) {
    // The value is a URL/template, never a secret — print it so the log
    // shows exactly which unresolved reference Railway passed through.
    throw new Error(
      "CRON_TARGET_URL must resolve to one concrete Railway web-service domain " +
        `(received an unresolved Railway template reference: "${value}" — ` +
        "check the service name inside ${{…}} or enter the generated " +
        "*.up.railway.app domain literally, then apply the staged variable change)",
    );
  }

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
  if (url.hostname.includes("*")) {
    throw new Error(
      "CRON_TARGET_URL must resolve to one concrete Railway web-service domain " +
        `(received a wildcard hostname: "${url.hostname}")`,
    );
  }

  if (url.protocol === "http:" && !isLocalOrPrivateHost(url.hostname)) {
    url.protocol = "https:";
    url.port = "";
  }

  return url.origin;
}

async function waitBeforeRetry(delayMs, signal) {
  if (signal?.aborted) throw signal.reason ?? new Error("request aborted");
  if (delayMs <= 0) return;

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error("request aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
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
  const maxNetworkRetries = options.maxNetworkRetries ?? DEFAULT_NETWORK_RETRIES;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  let current = initial;
  let redirectCount = 0;
  let networkRetries = 0;

  while (redirectCount <= MAX_REDIRECTS) {
    let response;
    try {
      response = await fetchImpl(current, {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${secret}`,
        },
        redirect: "manual",
        signal: options.signal,
      });
    } catch (error) {
      const diagnosis = classifyCronRequestError(error);
      if (
        options.signal?.aborted ||
        !diagnosis.retryable ||
        networkRetries >= maxNetworkRetries
      ) {
        throw error;
      }
      networkRetries += 1;
      await waitBeforeRetry(retryDelayMs, options.signal);
      continue;
    }

    if (!REDIRECT_STATUSES.has(response.status)) {
      return {
        response,
        finalUrl: current,
        redirects: redirectCount,
        networkRetries,
      };
    }

    const location = response.headers.get("location");
    if (!location) {
      throw new Error(`cron target returned ${response.status} without Location`);
    }
    if (redirectCount === MAX_REDIRECTS) {
      throw new Error(`cron target exceeded ${MAX_REDIRECTS} redirects`);
    }

    const next = new URL(location, current);
    const safeOrigin = isSafeRedirectOrigin(initial, next);
    const safePath = normalizedPath(next.pathname) === expectedPath;

    if (
      !safeOrigin ||
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
    redirectCount += 1;
  }

  throw new Error("unreachable cron redirect state");
}
