import type { Instrumentation } from "next";
import { reportError } from "@/lib/observability";
import { validateEnvironment } from "@/lib/env-validation";

export function register(): void {
  // Boot-time report for deployments that bypass npm lifecycle hooks. This
  // must never crash the server: a running app with loud log lines beats an
  // opaque crash loop that the platform only reports as "service unavailable".
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.AERA_ENVIRONMENT === "production" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    try {
      validateEnvironment(process.env, "production");
    } catch (error) {
      console.error("[aera] Environment validation reported issues (server continues):");
      console.error(error instanceof Error ? error.message : String(error));
    }
  }
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  reportError(error, {
    path: request.path,
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
    routerKind: context.routerKind,
    requestId: request.headers["x-request-id"] ?? request.headers["x-railway-request-id"],
  });
};

