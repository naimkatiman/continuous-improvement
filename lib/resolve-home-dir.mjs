// resolve-home-dir.mts — Single source of truth for the telemetry home dir
// resolution rule shared by hooks/three-section-close.mjs and bin/hook-stats.mjs.
//
// Previously this 20-line function lived in three byte-equivalent copies; this
// module collapses them. Behavior is unchanged.
import { homedir } from "node:os";
/**
 * Resolve the home directory used to locate `.claude/hook-telemetry/`.
 *
 * Contract (AND-semantic opt-out):
 *   - If BOTH `HOME` and `USERPROFILE` are explicitly set to the empty string
 *     (set, not merely undefined), return `""`. This is the operator/test
 *     opt-out signal: telemetry is intentionally disabled.
 *   - Otherwise return the first truthy value from, in order:
 *     `process.env.HOME`, `process.env.USERPROFILE`, `os.homedir()`.
 *   - If none yields a truthy path, return `""`.
 *
 * The AND-semantic is deliberate: an OR-semantic would silently disable
 * telemetry whenever a shell happened to clear one variable while the other
 * still pointed at a valid path.
 *
 * Never throws. `os.homedir()` is wrapped in try/catch because it can throw
 * in pathological env conditions.
 */
export function resolveHomeDir() {
    const home = process.env.HOME;
    const userProfile = process.env.USERPROFILE;
    if (home === "" && userProfile === "")
        return "";
    if (home)
        return home;
    if (userProfile)
        return userProfile;
    try {
        const fromOs = homedir();
        if (fromOs)
            return fromOs;
    }
    catch {
        // os.homedir() can throw in pathological env conditions
    }
    return "";
}
