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
  const redacted: ReadonlyArray<[string, string]> = [
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
  const untouched: ReadonlyArray<string> = [
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

// The value used to end at the first whitespace, so a quoted passphrase lost
// only its first word and the rest was written at rest.
describe("redactSecrets: quoted values", () => {
  const redacted: ReadonlyArray<[string, string]> = [
    ['DB_PASSWORD="correct horse battery staple" ./run.sh', 'DB_PASSWORD="<redacted>" ./run.sh'],
    ["API_TOKEN='part one part two' ./run.sh", "API_TOKEN='<redacted>' ./run.sh"],
    ['$env:DB_PASSWORD = "two words"; ./run.ps1', '$env:DB_PASSWORD = "<redacted>"; ./run.ps1'],
    ['$Password = "hunter2 SECRET value"', '$Password = "<redacted>"'],
    // The same assignment inside serialised JSON, where the quotes are escaped.
    ['{"command":"$env:DB_PASSWORD = \\"two words\\"; ./run.ps1"}', '{"command":"$env:DB_PASSWORD = \\"<redacted>\\"; ./run.ps1"}'],
    // An opening quote with no closing one still hides everything after it.
    ['DB_PASSWORD="correct horse battery', 'DB_PASSWORD="<redacted>"'],
    // An unquoted value is unchanged: it ends at the first whitespace.
    [`API_TOKEN=${SECRET} ./deploy.sh`, "API_TOKEN=<redacted> ./deploy.sh"],
  ];
  for (const [text, expected] of redacted) {
    it(`redacts ${JSON.stringify(text)}`, () => {
      assert.equal(redactSecrets(text), expected);
    });
  }

  it("is stable when run again over its own output", () => {
    const once = redactSecrets('DB_PASSWORD="correct horse battery staple" TOKEN=abc ./run.sh');
    assert.equal(redactSecrets(once), once);
  });
});

// In JSON the name is closed by a quote before the colon, so a rule that wants
// `:` or `=` directly after the name never fired on a JSON property. JSON is the
// shape of every MCP tool input and of most API replies.
describe("redactSecrets: JSON properties", () => {
  const redacted: ReadonlyArray<[string, string]> = [
    [
      `{"host":"db.test","user":"app","password":"${SECRET}"}`,
      '{"host":"db.test","user":"app","password":"<redacted>"}',
    ],
    [`{"API_TOKEN":"${SECRET}"}`, '{"API_TOKEN":"<redacted>"}'],
    [`{"api_key": "${SECRET}"}`, '{"api_key": "<redacted>"}'],
    [
      `curl -s -X POST https://x.test/login -d '{"user":"a","password":"${SECRET}"}'`,
      `curl -s -X POST https://x.test/login -d '{"user":"a","password":"<redacted>"}'`,
    ],
    [
      '    "SecretAccessKey": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",\n    "Expiration": "2026-01-01"',
      '    "SecretAccessKey": "<redacted>",\n    "Expiration": "2026-01-01"',
    ],
    [
      `{"access_token":"ya29.${SECRET}","token_type":"Bearer"}`,
      '{"access_token":"<redacted>","token_type":"Bearer"}',
    ],
    [`{'clientSecret': '${SECRET}'}`, "{'clientSecret': '<redacted>'}"],
    // JSON inside a JSON string: the quotes arrive escaped.
    [
      `{"stdout":"{\\"access_token\\":\\"${SECRET}\\",\\"token_type\\":\\"bearer\\"}"}`,
      '{"stdout":"{\\"access_token\\":\\"<redacted>\\",\\"token_type\\":\\"bearer\\"}"}',
    ],
    // A value that is not a string ends at the comma, so the rest of the object survives.
    ['{"pin_token":123456,"ok":true}', '{"pin_token":<redacted>,"ok":true}'],
  ];
  for (const [text, expected] of redacted) {
    it(`redacts ${JSON.stringify(text)}`, () => {
      assert.equal(redactSecrets(text), expected);
    });
  }

  const untouched: ReadonlyArray<string> = [
    '{"token_type":"bearer","expires_in":3600}',
    '{"usage":{"input_tokens":12,"output_tokens":3}}',
    '{"file_path":"src/lib/keyboard.ts"}',
  ];
  for (const text of untouched) {
    it(`leaves ${JSON.stringify(text)} alone`, () => {
      assert.equal(redactSecrets(text), text);
    });
  }
});
