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
// Cost: linear on ordinary text. One shape is still quadratic: on a long run
// of `eyJ-` the JWT pattern retries at every `eyJ` and walks the rest of the
// run (24 KB takes about 120 ms). Callers pass a bounded slice, never a whole
// payload.
// The name side of a `NAME=value` / `name: value` secret assignment: anything
// that ends in KEY, SECRET, TOKEN, PASSWORD, PASSWD or PWD. The keyword alone is
// a name (`PASSWORD=`, `--password=`, `SECRET=`), and so is a hyphenated,
// dotted or underscore-led one (`x-api-key`, `_authToken`). A plural or a short
// numeric suffix still counts (`API_KEYS`, `GITHUB_TOKEN_2`); `max_tokens` and
// `keyword` do not, because the keyword has to end the name. A name starts at a
// boundary, so the scan stays linear on long dash- or dot-separated text.
// The shell's own PWD and OLDPWD are left alone when the value is a path.
//
// Three names are set apart: `key`, `keys` and `token` with nothing else in
// them. They are ordinary words far more often than secrets (a React or sort
// key, a key press, a count of keys, a variable called token), so SECRET_NAME
// does not match them and BARE_SECRET_NAME does. A value under SECRET_NAME is
// always redacted; a value under a bare name only when it is credential-shaped.
const NAME_BOUNDARY = String.raw `(?<![A-Za-z0-9_.-])`;
const BARE_SECRET_NAME = String.raw `${NAME_BOUNDARY}(?:KEYS?|TOKEN)(?![A-Za-z0-9_.-])`;
const SECRET_NAME = String.raw `${NAME_BOUNDARY}(?!(?:OLD)?PWD\s*[:=]\s*(?:[/~.]|[A-Za-z]:[\\/]))(?!(?:KEYS?|TOKEN)(?![A-Za-z0-9_.-]))` +
    String.raw `[A-Za-z0-9_.-]*(?:(?:KEY|SECRET|PASSWORD)S?|TOKEN|PASSWD|PWD)(?:_?[0-9]{1,3})?`;
// The value side. A quoted value is taken whole, spaces included, in the three
// spellings it shows up in: escaped quotes (the assignment sits inside
// serialised JSON), double quotes and single quotes. An opening quote with no
// closing one runs to the end of the text. Anything else ends at whitespace.
const QUOTED_VALUE = String.raw `\\"(?:[^"\\]|\\[^"])*(?:\\"|$)|"[^"]*(?:"|$)|'[^']*(?:'|$)`;
// A quote followed by whitespace or the end of the text closes a string, it
// does not open a value: in `grep -n "apiKey:" src/config.ts` the name is the
// last thing inside the pattern and nothing after it is a secret. Reading that
// quote as an opening one also pairs every later quote wrongly, which leaves a
// real quoted value further on unredacted. The same holds for `PASSWORD=""`.
const NOT_A_CLOSING_QUOTE = String.raw `(?!(?:\\?["'])+(?:\s|$))`;
// What sits between the name and its value. The value is on the same line, and
// it follows a colon, an `=` it touches (`API_KEY=x`), an `=` with a blank in
// front of it (`$x = v`, `password = v`) or an `=` and then a quote. `NAME=`
// followed by a blank is an empty assignment (`OPENAI_API_KEY= pytest -q` runs
// pytest with the variable blanked), and so is a name at the end of a line:
// the next word, or the next line, is not the value.
const ASSIGNMENT_SEPARATOR = String.raw `[ \t]*:[ \t]*|[ \t]+=[ \t]*|=(?=\S)|=[ \t]+(?=\\?["'])`;
const assignmentRule = (name) => new RegExp(String.raw `(${name})(${ASSIGNMENT_SEPARATOR})${NOT_A_CLOSING_QUOTE}(${QUOTED_VALUE}|\S+)`, "gi");
const SECRET_ASSIGNMENT_RE = assignmentRule(SECRET_NAME);
const BARE_ASSIGNMENT_RE = assignmentRule(BARE_SECRET_NAME);
// The same assignment as a JSON property, where a quote closes the name before
// the colon: "password":"v", or \"password\":\"v\" when the JSON sits inside a
// JSON string. JSON is the shape of every MCP tool input and most API replies.
// A value that is not a string (a number, true, null) ends at the next comma
// or bracket, so the rest of the object survives. The value is on the same
// line as the name here too.
const propertyRule = (name) => new RegExp(String.raw `(${name})(\\?["'][ \t]*[:=][ \t]*)${NOT_A_CLOSING_QUOTE}(${QUOTED_VALUE}|[^\s,}\]]+)`, "gi");
const SECRET_PROPERTY_RE = propertyRule(SECRET_NAME);
const BARE_PROPERTY_RE = propertyRule(BARE_SECRET_NAME);
// Credentials that carry no KEY/TOKEN/PASSWORD name. Each rule is anchored on
// fixed punctuation, so it is linear on the bounded text callers pass.
//
// A private key block, through its END line or to the end of a cut-off head.
// The PGP armor closes its header with BLOCK (`BEGIN PGP PRIVATE KEY BLOCK`).
const PRIVATE_KEY_RE = /-----BEGIN [A-Z ]*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY(?: BLOCK)?-----|$)/g;
// An Authorization header with any scheme, or none: `Authorization: Basic x`,
// `"Authorization":"token x"`. A known scheme word is kept.
const AUTHORIZATION_RE = /\b(Authorization\\?["']?\s*[:=]\s*\\?["']?)((?:Basic|Bearer|Token|Negotiate|NTLM|ApiKey)\s+)?([^\s"'\\]+)/gi;
// user:password@ in a URL, or :password@ with no user (the Redis URL form).
// The scheme, user and host are kept.
const URL_USERINFO_RE = /(:\/\/[^\s/:@"']*:)[^\s/?#"']+(?=@)/g;
// curl -u user:password / --user user:password. The user is kept. -u is also
// UTC for date, unbuffered for python, unique for sort and uid:gid for docker,
// and --user is a pip switch, so three shapes are not credentials: a value
// that starts with `+` (a date format) or a drive letter (a Windows path), a
// numeric uid:gid, and a URL (`-u redis://host`, `--user git+https://host`,
// whose password, if it has one, the URL rule above has already taken).
const USER_FLAG_RE = /((?:^|\s)(?:-u|--user)(?:\s+|=)["']?(?!\+|[A-Za-z]:[\\/]|[0-9]+:[0-9]+(?![^\s"']))[^\s:"']+:)(?!\/\/)[^\s"']+/g;
// A secret flag whose value is the next argument: `--password v`, `--api-key v`,
// `--token v`, PowerShell's `-Password v`. A following flag is not a value.
const SECRET_FLAG_RE = new RegExp(String.raw `((?:^|\s)--?[A-Za-z0-9-]*(?:password|passwd|secret|token|api-?key)\s+)(?!-)${NOT_A_CLOSING_QUOTE}(${QUOTED_VALUE}|\S+)`, "gi");
// Tokens with a provider prefix are secret wherever they appear: GitHub
// (ghp_, gho_, ghu_, ghs_, ghr_, github_pat_), sk- API keys, Slack, npm, GitLab.
const PROVIDER_TOKEN_RE = /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|npm_[A-Za-z0-9]{36}|glpat-[A-Za-z0-9_-]{20,})/g;
// A JWT: three base64url segments joined by dots. The header is base64 of a
// JSON object, so it always starts with eyJ; without that anchor the rule took
// dotted identifiers (test ids, type names, `a.b.c()` chains, file names).
const JWT_RE = /\beyJ[A-Za-z0-9_-]{7,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
// A bare run of 32 or more hex characters: a key, or far more often a git
// object id, a checksum or a bundle file name. The placeholder keeps the first
// HEX_KEPT_PREFIX characters, so a row is still found by short SHA; of a
// 40-character value 128 bits stay hidden. A hex value on the value side of a
// secret name never gets here: the rules above have replaced it whole.
const LONG_HEX_RE = /\b[a-f0-9]{32,}\b/gi;
/** How many leading characters of a long hex run its placeholder keeps. */
export const HEX_KEPT_PREFIX = 8;
const SECRET_NAME_ONLY_RE = new RegExp(`^(?:${SECRET_NAME})$`, "i");
const BARE_SECRET_NAME_ONLY_RE = /^(?:keys?|token)$/i;
// The characters a generated key or token is made of (base64url plus `+`).
// `/`, `.` and `:` are left out so a path, a property chain and a cache key
// break into short runs.
const CREDENTIAL_RUN_RE = /[A-Za-z0-9_+-]{16,}/g;
/**
 * True when `name` alone names a secret (`password`, `API_TOKEN`, `x-api-key`).
 * For a caller that holds structured data and can drop the value of such a
 * property outright instead of pattern-matching serialised text. False for the
 * bare names `key`, `keys` and `token`: see isBareSecretName.
 */
export function isSecretName(name) {
    return SECRET_NAME_ONLY_RE.test(name);
}
/**
 * True for `key`, `keys` and `token` with nothing else in the name. A value
 * under such a name is a secret only when isCredentialShaped says so.
 */
export function isBareSecretName(name) {
    return BARE_SECRET_NAME_ONLY_RE.test(name);
}
/**
 * True when `value` holds a run of 16 or more letters, digits, `_`, `-` or `+`
 * with both a letter and a digit in it: the shape of a generated key or token,
 * and not of a word, a number, a path, a property chain or a call.
 */
export function isCredentialShaped(value) {
    for (const run of value.match(CREDENTIAL_RUN_RE) ?? []) {
        if (/[A-Za-z]/.test(run) && /[0-9]/.test(run))
            return true;
    }
    return false;
}
// Replace a matched value, keeping the quotes it was written in.
function redactedValue(value) {
    if (value.startsWith('\\"'))
        return '\\"<redacted>\\"';
    const quote = value[0];
    return quote === '"' || quote === "'" ? `${quote}<redacted>${quote}` : "<redacted>";
}
const redactNamedValue = (_match, name, separator, value) => `${name}${separator}${redactedValue(value)}`;
// A bare name whose value is an ordinary word is left exactly as written. The
// always-secret names are redacted before this runs, so a secret that sits
// inside such a value (`?key=name&password=...`) is already gone.
const redactNamedValueIfShaped = (match, name, separator, value) => isCredentialShaped(value) ? `${name}${separator}${redactedValue(value)}` : match;
/**
 * Redact common secret shapes from text. Pattern-based, so it covers the shapes
 * below and nothing else: private key blocks, AWS access key ids, Authorization
 * headers, a password inside a URL, `curl -u` credentials, KEY/SECRET/TOKEN/
 * PASSWORD assignments, JSON properties and flags (under a bare `key`, `keys`
 * or `token` only a credential-shaped value), provider-prefixed tokens, JWTs,
 * and long hex strings (all but their first 8 characters).
 */
export function redactSecrets(text) {
    return text
        .replace(PRIVATE_KEY_RE, "<private-key-redacted>")
        .replace(/(AKIA|ASIA)[0-9A-Z]{16}/g, "$1<redacted>")
        .replace(/Bearer\s+[A-Za-z0-9._~+/-]{20,}=*/gi, "Bearer <redacted>")
        .replace(AUTHORIZATION_RE, "$1$2<redacted>")
        .replace(URL_USERINFO_RE, "$1<redacted>")
        .replace(USER_FLAG_RE, "$1<redacted>")
        .replace(SECRET_PROPERTY_RE, redactNamedValue)
        .replace(BARE_PROPERTY_RE, redactNamedValueIfShaped)
        .replace(SECRET_ASSIGNMENT_RE, redactNamedValue)
        .replace(BARE_ASSIGNMENT_RE, redactNamedValueIfShaped)
        .replace(SECRET_FLAG_RE, (_match, flag, value) => `${flag}${redactedValue(value)}`)
        .replace(PROVIDER_TOKEN_RE, "<token-redacted>")
        .replace(JWT_RE, "<jwt-redacted>")
        .replace(LONG_HEX_RE, (hex) => `<hex-redacted:${hex.slice(0, HEX_KEPT_PREFIX)}>`);
}
