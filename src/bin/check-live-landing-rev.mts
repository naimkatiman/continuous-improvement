#!/usr/bin/env node

/**
 * Poll the live landing page until it serves package.json's version.
 *
 * Wrangler returning success is not the same as the CDN serving the new HTML.
 * v3.25.0 published, created the GitHub release, and uploaded Pages; the next
 * step then read *.pages.dev in the same second and still saw REV 3.24.0, so
 * the job went red. Ten minutes later both the apex and *.pages.dev served
 * 3.25.0. curl --retry only retries transport failure, not a successful
 * response with a stale REV.
 *
 * Usage:
 *   node bin/check-live-landing-rev.mjs [repo-root]
 *     [--timeout-ms=90000] [--interval-ms=5000] [--fetch=path-to-module]
 *
 * Exit codes:
 *   0 — a polled URL served REV equal to package.json
 *   1 — timeout, or neither URL yielded a REV
 */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { argv, cwd, exit } from "node:process";

export const APEX_URL = "https://continuous-improvement.dev/";
export const PAGES_DEV_URL = "https://continuous-improvement.pages.dev/";
export const DEFAULT_TIMEOUT_MS = 90_000;
export const DEFAULT_INTERVAL_MS = 5_000;
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export type FetchHtml = (url: string) => Promise<string | null>;

export interface WaitResult {
  ok: boolean;
  url: string;
  live: string | null;
  attempts: number;
}

export function extractRev(html: string): string | null {
  const m = /REV ([0-9]+\.[0-9]+\.[0-9]+)/.exec(html);
  return m?.[1] ?? null;
}

export async function defaultFetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA },
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForLiveRev(opts: {
  expected: string;
  fetchHtml: FetchHtml;
  timeoutMs?: number;
  intervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<WaitResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? delay;
  const start = now();
  let attempts = 0;
  let last: WaitResult = { ok: false, url: APEX_URL, live: null, attempts: 0 };

  while (true) {
    attempts += 1;
    for (const url of [APEX_URL, PAGES_DEV_URL]) {
      const html = await opts.fetchHtml(url);
      const live = html ? extractRev(html) : null;
      if (live !== null) last = { ok: false, url, live, attempts };
      if (live === opts.expected) {
        return { ok: true, url, live, attempts };
      }
    }
    last = { ...last, attempts };
    if (now() >= start + timeoutMs) break;
    await sleep(intervalMs);
  }
  return last;
}

function readArg(prefix: string, fallback: string | undefined): string | undefined {
  const hit = argv.find((a) => a.startsWith(prefix));
  if (!hit) return fallback;
  return hit.slice(prefix.length);
}

async function loadFetch(specifier: string | undefined): Promise<FetchHtml> {
  if (!specifier) return defaultFetchHtml;
  const mod = (await import(pathToFileURL(specifier).href)) as { default?: FetchHtml };
  if (typeof mod.default !== "function") {
    throw new Error(`--fetch module must default-export a fetchHtml(url) function`);
  }
  return mod.default;
}

async function main(): Promise<void> {
  const positional = argv.slice(2).filter((a) => !a.startsWith("--"));
  const repoRoot = positional[0] ?? cwd();
  const timeoutMs = Number(readArg("--timeout-ms=", String(DEFAULT_TIMEOUT_MS)));
  const intervalMs = Number(readArg("--interval-ms=", String(DEFAULT_INTERVAL_MS)));
  const fetchPath = readArg("--fetch=", undefined);

  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
    version?: unknown;
  };
  const expected = typeof pkg.version === "string" ? pkg.version : "";
  if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(expected)) {
    console.error(`::error::package.json version is missing or invalid: ${expected || "<none>"}`);
    exit(1);
  }

  const fetchHtml = await loadFetch(fetchPath);
  const result = await waitForLiveRev({ expected, fetchHtml, timeoutMs, intervalMs });

  console.log(`package.json : ${expected}`);
  console.log(`live ${result.url} : ${result.live ?? "<none>"} (${result.attempts} attempt(s))`);

  if (!result.ok) {
    console.error(
      `::error::Landing deploy did not take: serving '${result.live ?? "<none>"}' but this release is ${expected}.`,
    );
    exit(1);
  }
  console.log(`✓ continuous-improvement.dev is serving ${expected}`);
}

const invokedDirectly =
  argv[1] !== undefined && import.meta.url.endsWith(argv[1].replace(/\\/g, "/"));
if (invokedDirectly || argv[1]?.endsWith("check-live-landing-rev.mjs")) {
  await main();
}
