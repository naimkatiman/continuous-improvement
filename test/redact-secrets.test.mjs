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
// The separator used to let any whitespace, a line break included, sit between
// the name and the value. `NAME= command` is the shell idiom for running one
// command with the variable blanked, and a name at the end of a line has no
// value on it: the next word, or the next line, was redacted in its place.
describe("redactSecrets: an empty assignment has no value", () => {
    const untouched = [
        "OPENAI_API_KEY= pytest -q",
        "OPENROUTER_API_KEY= npx vitest run",
        "OPENAI_API_KEY=\nANTHROPIC_API_KEY=\n",
        "OPENAI_API_KEY=\r\nANTHROPIC_API_KEY=\r\n",
        "export API_KEY=\n# set the key above, then run: npm test",
        "Enter password:\nConnection established",
        '"password":\n  secretKeyRef: db',
        "API_KEY=",
        "password: ",
    ];
    for (const text of untouched) {
        it(`leaves ${JSON.stringify(text)} alone`, () => {
            assert.equal(redactSecrets(text), text);
        });
    }
    // A value on the same line is still one: directly after the `=`, after a
    // colon, after an `=` that has a blank in front of it, or in quotes.
    const redacted = [
        [`API_KEY=${SECRET} pytest -q`, "API_KEY=<redacted> pytest -q"],
        [`password:${SECRET}`, "password:<redacted>"],
        [`password = ${SECRET}`, "password = <redacted>"],
        [`API_KEY\t= ${SECRET}`, "API_KEY\t= <redacted>"],
        ['API_KEY= "quoted value" pytest -q', 'API_KEY= "<redacted>" pytest -q'],
        [`OPENAI_API_KEY=\nANTHROPIC_API_KEY=${SECRET}\n`, "OPENAI_API_KEY=\nANTHROPIC_API_KEY=<redacted>\n"],
    ];
    for (const [text, expected] of redacted) {
        it(`redacts ${JSON.stringify(text)}`, () => {
            assert.equal(redactSecrets(text), expected);
        });
    }
});
// The value used to end at the first whitespace, so a quoted passphrase lost
// only its first word and the rest was written at rest.
describe("redactSecrets: quoted values", () => {
    const redacted = [
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
    // When the name is the last thing inside a quoted string (a grep pattern, a
    // log label, a -S argument) the quote after it closes that string. Reading it
    // as the opening quote of a value deleted everything up to the next quote, or
    // to the end of the row.
    const closingQuote = [
        'grep -n "apiKey:" src/config.ts | head -5 && npm test',
        "grep -rn 'password=' config/ ; npm run build",
        `git log -S 'API_KEY = "' --oneline -5 -- src/config.ts`,
        `grep -n '"apiKey":' src/config.json | head -5 && npm test`,
        'grep -c "use --token " docs/cli.md && npm run build',
        'echo "DB_PASSWORD=" && cat .env.example',
        'grep -n "apiKey:"',
        // The same command inside serialised JSON, where the quotes are escaped.
        '{"command":"grep -n \\"apiKey:\\" src/config.ts && npm test"}',
        // An empty quoted value has nothing in it to redact.
        'DB_PASSWORD="" ./run.sh',
    ];
    for (const text of closingQuote) {
        it(`keeps the text after a closing quote in ${JSON.stringify(text)}`, () => {
            assert.equal(redactSecrets(text), text);
        });
    }
    it("still redacts a quoted value later in the same command", () => {
        assert.equal(redactSecrets('grep -n "apiKey:" src/config.ts && API_KEY="two words" npm test'), 'grep -n "apiKey:" src/config.ts && API_KEY="<redacted>" npm test');
    });
});
// In JSON the name is closed by a quote before the colon, so a rule that wants
// `:` or `=` directly after the name never fired on a JSON property. JSON is the
// shape of every MCP tool input and of most API replies.
describe("redactSecrets: JSON properties", () => {
    const redacted = [
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
    const untouched = [
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
// Credentials that sit in a command head with no KEY/TOKEN/PASSWORD name in
// front of them: each of these had no rule at all.
describe("redactSecrets: credential shapes without a secret name", () => {
    const GH_TOKEN = "ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJ";
    const redacted = [
        // user:password@ in a URL
        [
            `psql postgres://admin:${SECRET}@db.example.test:5432/app`,
            "psql postgres://admin:<redacted>@db.example.test:5432/app",
        ],
        [`git clone https://deploy:${GH_TOKEN}@github.test/o/r.git`, "git clone https://deploy:<redacted>@github.test/o/r.git"],
        // A user that is itself a secret name is caught by the assignment rule,
        // which takes the rest of the word with it.
        [
            `git remote set-url origin https://x-access-token:${GH_TOKEN}@github.com/o/r.git`,
            "git remote set-url origin https://x-access-token:<redacted>",
        ],
        [
            `DATABASE_URL=postgres://app:${SECRET}@db.test:5432/app npm run migrate`,
            "DATABASE_URL=postgres://app:<redacted>@db.test:5432/app npm run migrate",
        ],
        // :password@ with no user in front of it, the standard Redis URL form
        [
            `REDIS_URL=redis://:${SECRET}@10.0.0.5:6379/0 node app.js`,
            "REDIS_URL=redis://:<redacted>@10.0.0.5:6379/0 node app.js",
        ],
        [
            `Connecting to rediss://:${SECRET}@cache.internal:6380 ...`,
            "Connecting to rediss://:<redacted>@cache.internal:6380 ...",
        ],
        [
            `celery -A proj worker -b redis://:${SECRET}@cache.internal:6379/0`,
            "celery -A proj worker -b redis://:<redacted>@cache.internal:6379/0",
        ],
        [`node -e "new Redis('redis://:${SECRET}@10.0.0.5:6379')"`, `node -e "new Redis('redis://:<redacted>@10.0.0.5:6379')"`],
        // an Authorization header with any scheme, or none
        [
            'curl -H "Authorization: Basic dXNlcjpodW50ZXIyU0VDUkVU" https://x.test',
            'curl -H "Authorization: Basic <redacted>" https://x.test',
        ],
        [
            `curl -H "Authorization: token ${GH_TOKEN}" https://x.test`,
            'curl -H "Authorization: token <redacted>" https://x.test',
        ],
        ["Authorization: Bearer abc123SHORTtok", "Authorization: Bearer <redacted>"],
        [`Authorization: ${SECRET}`, "Authorization: <redacted>"],
        ['{"Authorization":"Basic dXNlcjpodW50ZXIyU0VDUkVU"}', '{"Authorization":"Basic <redacted>"}'],
        // curl -u user:password
        [`curl -u admin:${SECRET} https://x.test`, "curl -u admin:<redacted> https://x.test"],
        [`curl --user admin:${SECRET} https://x.test`, "curl --user admin:<redacted> https://x.test"],
        // a secret flag whose value is the next argument
        [`mysql -u root --password ${SECRET} db`, "mysql -u root --password <redacted> db"],
        [`deploy --api-key ${SECRET} --env staging`, "deploy --api-key <redacted> --env staging"],
        [`cli login --token ${SECRET}`, "cli login --token <redacted>"],
        [`Connect-Service -Password "two ${SECRET}" -Verbose`, 'Connect-Service -Password "<redacted>" -Verbose'],
        // provider-prefixed tokens, wherever they appear
        [`echo ${GH_TOKEN} | gh auth login --with-token`, "echo <token-redacted> | gh auth login --with-token"],
        ["gho_abcdefghijklmnopqrstuvwxyzABCDEFGHIJ", "<token-redacted>"],
        [
            "github_pat_11ABCDEFG0abcdefghijkl_mnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghi",
            "<token-redacted>",
        ],
        ["claude --key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789", "claude --key <token-redacted>"],
        ["xox" + "b-1234567890-abcdefghijklmnop", "<token-redacted>"],
        ["npm_abcdefghijklmnopqrstuvwxyzABCDEFGHIJ", "<token-redacted>"],
        ["glpat-abcdefghijklmnopqrst", "<token-redacted>"],
        ["AccessKeyId: ASIAIOSFODNN7EXAMPLE", "AccessKeyId: ASIA<redacted>"],
        // a private key, through its END line or to the end of a cut-off head
        [
            "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\n-----END OPENSSH PRIVATE KEY-----\nnext",
            "<private-key-redacted>\nnext",
        ],
        ["-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA7", "<private-key-redacted>"],
    ];
    for (const [text, expected] of redacted) {
        it(`redacts ${JSON.stringify(text)}`, () => {
            assert.equal(redactSecrets(text), expected);
        });
    }
    // Near misses: the same punctuation with no credential in it.
    const untouched = [
        "curl https://example.test:8080/path@x",
        "git clone git@github.com:o/r.git",
        "git clone ssh://git@host.test:22/o/r.git",
        "curl https://user@host.test/x",
        "open file:///C:/Users/x/a@b.txt",
        "curl http://localhost:3000/users/@me",
        "psql postgres://localhost:5432/app",
        "git push -u origin feat/x",
        "sort -u names.txt",
        'psql --no-password -c "select 1"',
        "docker login --password-stdin registry.test",
        "npm_config_registry=https://registry.npmjs.org",
        "pip install sk-learn",
        "open authorization_endpoint.md",
        "-----BEGIN CERTIFICATE-----",
    ];
    for (const text of untouched) {
        it(`leaves ${JSON.stringify(text)} alone`, () => {
            assert.equal(redactSecrets(text), text);
        });
    }
    it("is stable when run again over its own output", () => {
        for (const [, expected] of redacted) {
            assert.equal(redactSecrets(expected), expected);
        }
    });
});
