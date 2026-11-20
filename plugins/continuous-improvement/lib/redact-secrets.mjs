// redact-secrets.mts — Pure secret-shape redactor. No I/O, no imports.
//
// Two callers: the observer redacts every summary before a row is written
// (src/lib/observe-event.mts), and recall redacts every snippet it returns
// (src/lib/recall-index.mts). It is its own file because the observer's lib
// imports are copied one by one, by the npm installer (OBSERVER_LIB_FILES in
// src/bin/install.mts) and by the plugin bundler (the copyFileTo list in
// src/bin/generate-plugin-manifests.mts). This file is on both lists; anything
// it starts importing has to be added to both as well.
//
// Cost: the JWT pattern is quadratic on long dash-separated text (60 KB takes
// seconds). Callers pass a bounded slice, never a whole payload.
/**
 * Redact common secret shapes from text. Conservative by design: matches AWS
 * access keys, JWT-shaped triplets, bearer tokens, KEY/SECRET/TOKEN/PASSWORD
 * assignments, and long hex strings.
 */
export function redactSecrets(text) {
    return text
        .replace(/AKIA[0-9A-Z]{16}/g, "AKIA<redacted>")
        .replace(/Bearer\s+[A-Za-z0-9._~+/-]{20,}=*/gi, "Bearer <redacted>")
        .replace(/\b([A-Za-z][A-Za-z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|PWD))(\s*[:=]\s*)(\S+)/gi, "$1$2<redacted>")
        .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "<jwt-redacted>")
        .replace(/\b[a-f0-9]{32,}\b/gi, "<hex-redacted>");
}
