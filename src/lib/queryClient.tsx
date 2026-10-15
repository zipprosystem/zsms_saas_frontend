"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Structural/reference Setup lists (Academic Years, Award Bodies, School
 * Types, Classes, Sections) rarely change within a session — 5 min lets
 * every consumer (a screen's own CrudScreen, a form's reference dropdown,
 * the header session picker, the Setup progression checklist) share one
 * fetch instead of each independently re-fetching on its own mount, which
 * is the actual point of this migration (see the retrofit plan: Academic
 * Years alone was being fetched 3-4x independently before this).
 *
 * The progression checklist overrides to PROGRESS_STALE_TIME_MS (shorter)
 * on its own derived queries — it's the one place a user actively watches
 * for a just-made change elsewhere to reflect, so fresher data matters
 * more there than staying maximally cache-friendly.
 */
export const STRUCTURAL_STALE_TIME_MS = 5 * 60 * 1000;
export const PROGRESS_STALE_TIME_MS = 60 * 1000;
const DEFAULT_STALE_TIME_MS = 2 * 60 * 1000;
const GC_TIME_MS = 10 * 60 * 1000;

/**
 * Thrown by a query's fetch wrapper for failures genuinely worth retrying:
 * network errors and 5xx. Every other outcome (forbidden,
 * devBypassUnavailable, validation, conflict — and ANY 4xx) is
 * deterministic: retrying the identical request can't fix it, so those
 * resolve normally instead of throwing and the query settles immediately.
 * See crudTypes.ts's throwIfTransient(), which every retrofitted queryFn
 * runs its CrudResult through.
 *
 * `status` is the HTTP status when the failure came from a response
 * (undefined for a network error, or from a service that doesn't report
 * it yet). isRetryableError() refuses any 4xx even if one gets thrown, so
 * the shared client is the backstop regardless of which wrapper threw.
 */
export class TransientQueryError extends Error {
  readonly status: number | undefined;

  constructor(status?: number) {
    super("Transient fetch failure — retry-worthy");
    this.name = "TransientQueryError";
    this.status = status;
  }
}

/** True for a 4xx — a client error the same request will always reproduce. */
export function isClientErrorStatus(status: number | undefined): boolean {
  return status !== undefined && status >= 400 && status < 500;
}

function isRetryableError(error: unknown): boolean {
  return error instanceof TransientQueryError && !isClientErrorStatus(error.status);
}

function retryDelay(attemptIndex: number): number {
  // 1s, 2s, 4s, capped at 30s — a low-bandwidth-appropriate backoff, not
  // hammering a flaky connection.
  return Math.min(1000 * 2 ** attemptIndex, 30000);
}

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: DEFAULT_STALE_TIME_MS,
        gcTime: GC_TIME_MS,
        retry: (failureCount, error) => isRetryableError(error) && failureCount < 2,
        retryDelay,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        // Explicit, not just relying on the library default (which is also
        // 0) — auto-retrying a submitted form risks double-applying a
        // mutation that a transient failure's later, identical, USER-
        // initiated retry would already handle correctly.
        retry: false,
      },
    },
  });
}

// A fresh client per browser session (useState's lazy initializer, the
// standard Next.js App Router pattern) — never a module-level singleton,
// which would leak one request's data into another's on the server, and
// never recreated across re-renders on the client either.
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
