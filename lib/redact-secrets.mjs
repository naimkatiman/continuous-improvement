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
// The name side of a `NAME=value` / `name: value` secret assignment: anything
// that ends in KEY, SECRET, TOKEN, PASSWORD, PASSWD or PWD. The keyword alone is
// a name (`PASSWORD=`, `--password=`, `TOKEN=`), and so is a hyphenated,
// dotted or underscore-led one (`x-api-key`, `_authToken`). A plural or a short
// numeric suffix still counts (`API_KEYS`, `GITHUB_TOKEN_2`); `max_tokens` and
// `keyword` do not, because the keyword has to end the name. A name starts at a
// boundary, so the scan stays linear on long dash- or dot-separated text.
// The shell's own PWD and OLDPWD are left alone when the value is a path.
const SECRET_NAME = String.raw `(?<![A-Za-z0-9_.-])(?!(?:OLD)?PWD\s*[:=]\s*(?:[/~.]|[A-Za-z]:[\\/]))` +
    String.raw `[A-Za-z0-9_.-]*(?:(?:KEY|SECRET|PASSWORD)S?|TOKEN|PASSWD|PWD)(?:_?[0-9]{1,3})?`;
// The value side. A quoted value is taken whole, spaces included, in the three
// spellings it shows up in: escaped quotes (the assignment sits inside
// serialised JSON), double quotes and single quotes. An opening quote with no
// closing one runs to the end of the text. Anything else ends at whitespace.
const QUOTED_VALUE = String.raw `\\"(?:[^"\\]|\\[^"])*(?:\\"|$)|"[^"]*(?:"|$)|'[^']*(?:'|$)`;
const SECRET_ASSIGNMENT_RE = new RegExp(String.raw `(${SECRET_NAME})(\s*[:=]\s*)(${QUOTED_VALUE}|\S+)`, "gi");
// The same assignment as a JSON property, where a quote closes the name before
// the colon: "password":"v", or \"password\":\"v\" when the JSON sits inside a
// JSON string. JSON is the shape of every MCP tool input and most API replies.
// A value that is not a string (a number, true, null) ends at the next comma
// or bracket, so the rest of the object survives.
const SECRET_PROPERTY_RE = new RegExp(String.raw `(${SECRET_NAME})(\\?["']\s*[:=]\s*)(${QUOTED_VALUE}|[^\s,}\]]+)`, "gi");
// Credentials that carry no KEY/TOKEN/PASSWORD name. Each rule is anchored on
// fixed punctuation, so it is linear on the bounded text callers pass.
//
// A private key block, through its END line or to the end of a cut-off head.
const PRIVATE_KEY_RE = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g;
// An Authorization header with any scheme, or none: `Authorization: Basic x`,
// `"Authorization":"token x"`. A known scheme word is kept.
const AUTHORIZATION_RE = /\b(Authorization\\?["']?\s*[:=]\s*\\?["']?)((?:Basic|Bearer|Token|Negotiate|NTLM|ApiKey)\s+)?([^\s"'\\]+)/gi;
// user:password@ in a URL, or :password@ with no user (the Redis URL form).
// The scheme, user and host are kept.
const URL_USERINFO_RE = /(:\/\/[^\s/:@"']*:)[^\s/?#"']+(?=@)/g;
// curl -u user:password / --user user:password. The user is kept.
const USER_FLAG_RE = /((?:^|\s)(?:-u|--user)(?:\s+|=)["']?[^\s:"']+:)[^\s"']+/g;
// A secret flag whose value is the next argument: `--password v`, `--api-key v`,
// `--token v`, PowerShell's `-Password v`. A following flag is not a value.
const SECRET_FLAG_RE = new RegExp(String.raw `((?:^|\s)--?[A-Za-z0-9-]*(?:password|passwd|secret|token|api-?key)\s+)(?!-)(${QUOTED_VALUE}|\S+)`, "gi");
// Tokens with a provider prefix are secret wherever they appear: GitHub
// (ghp_, gho_, ghu_, ghs_, ghr_, github_pat_), sk- API keys, Slack, npm, GitLab.
const PROVIDER_TOKEN_RE = /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|npm_[A-Za-z0-9]{36}|glpat-[A-Za-z0-9_-]{20,})/g;
const SECRET_NAME_ONLY_RE = new RegExp(`^(?:${SECRET_NAME})$`, "i");
/**
 * True when `name` alone names a secret (`password`, `API_TOKEN`, `x-api-key`).
 * For a caller that holds structured data and can drop the value of such a
 * property outright instead of pattern-matching serialised text.
 */
export function isSecretName(name) {
    return SECRET_NAME_ONLY_RE.test(name);
}
// Replace a matched value, keeping the quotes it was written in.
function redactedValue(value) {
    if (value.startsWith('\\"'))
        return '\\"<redacted>\\"';
    const quote = value[0];
    return quote === '"' || quote === "'" ? `${quote}<redacted>${quote}` : "<redacted>";
}
/**
 * Redact common secret shapes from text. Pattern-based, so it covers the shapes
 * below and nothing else: private key blocks, AWS access key ids, Authorization
 * headers, a password inside a URL, `curl -u` credentials, KEY/SECRET/TOKEN/
 * PASSWORD assignments, JSON properties and flags, provider-prefixed tokens,
 * JWT-shaped triplets, and long hex strings.
 */
export function redactSecrets(text) {
    return text
        .replace(PRIVATE_KEY_RE, "<private-key-redacted>")
        .replace(/(AKIA|ASIA)[0-9A-Z]{16}/g, "$1<redacted>")
        .replace(/Bearer\s+[A-Za-z0-9._~+/-]{20,}=*/gi, "Bearer <redacted>")
        .replace(AUTHORIZATION_RE, "$1$2<redacted>")
        .replace(URL_USERINFO_RE, "$1<redacted>")
        .replace(USER_FLAG_RE, "$1<redacted>")
        .replace(SECRET_PROPERTY_RE, (_match, name, separator, value) => `${name}${separator}${redactedValue(value)}`)
        .replace(SECRET_ASSIGNMENT_RE, (_match, name, separator, value) => `${name}${separator}${redactedValue(value)}`)
        .replace(SECRET_FLAG_RE, (_match, flag, value) => `${flag}${redactedValue(value)}`)
        .replace(PROVIDER_TOKEN_RE, "<token-redacted>")
        .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "<jwt-redacted>")
        .replace(/\b[a-f0-9]{32,}\b/gi, "<hex-redacted>");
}
