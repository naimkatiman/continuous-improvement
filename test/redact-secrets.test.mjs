/**
 * Table tests for the secret-shape redactor (lib/redact-secrets.mjs).
 *
 * The observer redacts every summary with it before a row is written to
 * observations.jsonl, and recall redacts every snippet it returns, so a shape
 * this function misses is a secret at rest. Every value below is a fake.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { redactSecrets } from "../lib/redact-secrets.mjs";
const SECRET = "hunter2SECRETvalue";
// The name of a KEY/SECRET/TOKEN/PASSWORD assignment used to need at least one
// letter in front of the keyword and could hold neither a hyphen nor a leading
// underscore, so the most common spellings were written unredacted.
describe("redactSecrets: assignment names", () => {
    const redacted = [
        [`PASSWORD=${SECRET} TOKEN=${SECRET} ./deploy.sh`, "PASSWORD=<redacted> TOKEN=<redacted> ./deploy.sh"],
        [`export TOKEN=${SECRET}`, "export TOKEN=<redacted>"],
        [`SECRET=${SECRET} node x.js`, "SECRET=<redacted> node x.js"],
        [`KEY=${SECRET} node x.js`, "KEY=<redacted> node x.js"],
        [`mysql -uroot --password=${SECRET} app`, "mysql -uroot --password=<redacted> app"],
        [
            `kubectl create secret generic db --from-literal=password=${SECRET}`,
            "kubectl create secret generic db --from-literal=password=<redacted>",
        ],
        [`X-API-Key: ${SECRET}`, "X-API-Key: <redacted>"],
        [`x-api-key: ${SECRET}`, "x-api-key: <redacted>"],
        [`//registry.npmjs.org/:_authToken=${SECRET}`, "//registry.npmjs.org/:_authToken=<redacted>"],
        [`password: ${SECRET}`, "password: <redacted>"],
        [`GITHUB_TOKEN_2=${SECRET}`, "GITHUB_TOKEN_2=<redacted>"],
        [`API_KEYS=${SECRET}`, "API_KEYS=<redacted>"],
        [`$env:TOKEN=${SECRET}`, "$env:TOKEN=<redacted>"],
        [`MYSQL_PWD=${SECRET} mysql app`, "MYSQL_PWD=<redacted> mysql app"],
        [`PGPASSWORD=${SECRET} psql app`, "PGPASSWORD=<redacted> psql app"],
        // `cat .env`: every line, not only the ones after the first.
        [`SECRET=${SECRET}\nPASSWORD=${SECRET}\n`, "SECRET=<redacted>\nPASSWORD=<redacted>\n"],
        // The spellings that already worked keep working.
        [`API_TOKEN=${SECRET} ./deploy.sh`, "API_TOKEN=<redacted> ./deploy.sh"],
        [`DB_PASSWORD: ${SECRET}`, "DB_PASSWORD: <redacted>"],
        [`clientSecret=${SECRET}`, "clientSecret=<redacted>"],
    ];
    for (const [text, expected] of redacted) {
        it(`redacts ${JSON.stringify(text)}`, () => {
            assert.equal(redactSecrets(text), expected);
        });
    }
    // A name that only contains a keyword, and the shell's working-directory
    // variables (whose value is a path), are not secrets.
    const untouched = [
        "OLDPWD=/home/u/project",
        "PWD=/home/u/project",
        "PWD=C:\\Users\\u\\project",
        "max_tokens=4096",
        "token_budget: 100",
        "keyword=release",
        "git log --oneline -5 && npm run verify:all",
    ];
    for (const text of untouched) {
        it(`leaves ${JSON.stringify(text)} alone`, () => {
            assert.equal(redactSecrets(text), text);
        });
    }
});
