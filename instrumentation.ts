import type { Instrumentation } from "next";
import { reportError } from "@/lib/observability";
import { validateEnvironment } from "@/lib/env-validation";

export function register(): void {
  // `prestart` is the primary gate. This second gate protects deployments
  // started through a custom process manager that bypasses npm lifecycle hooks.
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.AERA_ENVIRONMENT === "production" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    validateEnvironment(process.env, "production");
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

