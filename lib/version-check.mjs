// version-check.mts — Pure update-check decision core + a thin npm-registry fetch
// helper. The decision functions take no ambient I/O: the caller injects the local
// version, the fetched remote version, the cached state, and the clock, so the whole
// thing is unit-testable offline (mirrors how the goal-state / recall scorers are
// structured). The ONLY network is fetchLatestNpmVersion, which fails closed
// (returns null) on any error. No telemetry: a one-way read of the public registry.
//
// Wired into bin/install.mts at install end so the nudge only appears when the user
// explicitly invokes the CLI. See docs/plans/2026-06-25-version-check-nudge.md.
// Two-tier TTL, copied from gstack: poll often while up-to-date so a release is
// caught quickly, then back off once an upgrade is known so the nudge is not
// re-fetched on every invocation.
export const TTL_UP_TO_DATE_MS = 60 * 60 * 1000; // 60 min
export const TTL_UPGRADE_MS = 12 * 60 * 60 * 1000; // 720 min
const NPM_REGISTRY = "https://registry.npmjs.org";
/** Parse "a.b.c" (ignoring a leading v and any -prerelease/+build suffix) into a
 *  numeric triple. Fail closed: any non-numeric core component returns null. */
export function parseSemver(version) {
    if (typeof version !== "string")
        return null;
    const core = version.trim().replace(/^v/, "").split(/[-+]/)[0] ?? "";
    const parts = core.split(".");
    if (parts.length !== 3)
        return null;
    const nums = parts.map((p) => (/^\d+$/.test(p) ? Number(p) : NaN));
    if (nums.some((n) => !Number.isFinite(n)))
        return null;
    return [nums[0], nums[1], nums[2]];
}
/** Is `remote` a strictly higher release than `local`? Non-semver on either side
 *  fails closed to false (never nudge on garbage; never nudge a dev build that is
 *  ahead of or equal to the registry). */
export function isNewer(remote, local) {
    const r = parseSemver(remote);
    const l = parseSemver(local);
    if (!r || !l)
        return false;
    for (let i = 0; i < 3; i += 1) {
        if (r[i] > l[i])
            return true;
        if (r[i] < l[i])
            return false;
    }
    return false;
}
/** Should the network fetch be skipped because the cached result is still fresh?
 *  Absent/NaN checkedAt fails OPEN (fetch) — a corrupt cache must not wedge the
 *  check off permanently. */
export function isThrottled(cache, now) {
    if (!cache || typeof cache.checkedAt !== "number" || !Number.isFinite(cache.checkedAt))
        return false;
    const ttl = cache.status === "upgrade-available" ? TTL_UPGRADE_MS : TTL_UP_TO_DATE_MS;
    return now - cache.checkedAt < ttl;
}
function buildNotice(local, remote) {
    return (`continuous-improvement ${remote} is available (you have ${local}). ` +
        "Update: marketplace → /plugin marketplace update continuous-improvement, " +
        "or npm → npx continuous-improvement install. Silence: CLAUDE_CI_UPDATE_CHECK=off");
}
/** Re-surface a still-valid pending upgrade straight from the cache, so a throttled
 *  invocation does not lose the nudge. Returns null unless the cache says an upgrade
 *  is pending AND that cached remote is still newer than the current local. */
export function pendingNotice(cache, local) {
    if (!cache || cache.status !== "upgrade-available")
        return null;
    if (typeof cache.remote !== "string" || !isNewer(cache.remote, local))
        return null;
    return buildNotice(local, cache.remote);
}
/** The pure decision from a fresh fetch. `remote === null` (fetch failed) yields
 *  `unknown` with no notice and no cache write, so the next invocation retries
 *  rather than caching a false "up-to-date". */
export function evaluateUpdateCheck(args) {
    const { local, remote, now } = args;
    if (remote === null || parseSemver(remote) === null) {
        return { status: "unknown", notice: null, nextCache: null };
    }
    if (isNewer(remote, local)) {
        return {
            status: "upgrade-available",
            notice: buildNotice(local, remote),
            nextCache: { status: "upgrade-available", local, remote, checkedAt: now },
        };
    }
    return {
        status: "up-to-date",
        notice: null,
        nextCache: { status: "up-to-date", local, remote, checkedAt: now },
    };
}
/** Fetch the `latest` dist-tag version for a package from the public npm registry.
 *  The only network in this module. Fails closed (returns null) on any error:
 *  timeout, non-2xx, malformed JSON, or a non-semver version string. fetchImpl and
 *  timeoutMs are injectable so callers and tests stay offline-deterministic. */
export async function fetchLatestNpmVersion(pkg, opts = {}) {
    const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    if (typeof fetchImpl !== "function")
        return null;
    try {
        const res = await fetchImpl(`${NPM_REGISTRY}/${pkg}/latest`, {
            headers: { Accept: "application/vnd.npm.install-v1+json" },
            signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
        });
        if (!res.ok)
            return null;
        const body = (await res.json());
        const version = typeof body.version === "string" ? body.version : null;
        if (!version || parseSemver(version) === null)
            return null;
        return version;
    }
    catch {
        return null;
    }
}
