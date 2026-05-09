#!/usr/bin/env node
// example-payload-shape.synthetic.mjs
//
// Second reference synthetic check, complementing example-version-endpoint.synthetic.sh.
// Demonstrates the more common real-world shape: instead of full byte-equality between
// production and baseline, this checks that both responses share the same JSON schema
// (keys present, types match), while allowing per-environment values to differ.
//
// Why this matters: in real deployments, /version on production vs staging will return
// different commit SHAs, different deploy timestamps, different release names. Byte
// equality fails on every check. Schema equality only fails when the contract drifts
// (a key removed, a type changed, a new field appeared on one side but not the other).
//
// Also exercises the .mjs runner branch in the verification-loop synthetic-checks rung
// (the existing .sh example only proves the bash branch works).
//
// Inputs (set by the verification-loop runner):
//   BASE_URL       Production base URL (required)
//   BASELINE_URL   Staging baseline URL (required)
//   EXPECTED_SHA   Deploy SHA the receipt reported COMPLETE (optional, used in note)
//
// Exit codes:
//   0   Production and baseline share the same schema on /version
//   1   Schema drift detected; stdout has a human-readable diff
//   2   Configuration error (missing input, endpoint unreachable, non-JSON response)

const BASE_URL = process.env.BASE_URL;
const BASELINE_URL = process.env.BASELINE_URL;
const EXPECTED_SHA = process.env.EXPECTED_SHA;

if (!BASE_URL || !BASELINE_URL) {
  console.error('configuration error: BASE_URL and BASELINE_URL must both be set');
  process.exit(2);
}

const stripTrailingSlash = (url) => url.replace(/\/$/, '');

async function fetchJson(url, label) {
  const target = `${stripTrailingSlash(url)}/version`;
  let response;
  try {
    response = await fetch(target, { signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    console.error(`configuration error: could not reach ${label} ${target}: ${err.message}`);
    process.exit(2);
  }
  if (!response.ok) {
    console.error(`configuration error: ${label} ${target} returned HTTP ${response.status}`);
    process.exit(2);
  }
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    console.error(`configuration error: ${label} ${target} returned non-JSON body: ${text.slice(0, 200)}`);
    process.exit(2);
  }
}

// Walk both objects and produce a list of schema differences.
// "Schema" = the set of keys at every nested level + the JS typeof at each leaf.
// Values are deliberately ignored — that is the entire point of this check shape.
function schemaDiff(prod, base, path = '$') {
  const diffs = [];
  const prodType = Array.isArray(prod) ? 'array' : typeof prod;
  const baseType = Array.isArray(base) ? 'array' : typeof base;

  if (prodType !== baseType) {
    diffs.push(`${path}: type drift — production=${prodType}, baseline=${baseType}`);
    return diffs;
  }

  if (prodType === 'object' && prod !== null && base !== null) {
    const prodKeys = new Set(Object.keys(prod));
    const baseKeys = new Set(Object.keys(base));
    for (const key of prodKeys) {
      if (!baseKeys.has(key)) diffs.push(`${path}.${key}: present in production, missing from baseline`);
    }
    for (const key of baseKeys) {
      if (!prodKeys.has(key)) diffs.push(`${path}.${key}: present in baseline, missing from production`);
    }
    for (const key of prodKeys) {
      if (baseKeys.has(key)) {
        diffs.push(...schemaDiff(prod[key], base[key], `${path}.${key}`));
      }
    }
  } else if (prodType === 'array') {
    // For arrays, compare the schema of the first element only — production and baseline
    // typically have different lengths but should agree on element shape.
    if (prod.length > 0 && base.length > 0) {
      diffs.push(...schemaDiff(prod[0], base[0], `${path}[0]`));
    }
  }

  return diffs;
}

const [prod, base] = await Promise.all([
  fetchJson(BASE_URL, 'production'),
  fetchJson(BASELINE_URL, 'baseline'),
]);

const diffs = schemaDiff(prod, base);

if (diffs.length === 0) {
  if (EXPECTED_SHA) {
    const prodHasSha = JSON.stringify(prod).includes(EXPECTED_SHA);
    if (!prodHasSha) {
      console.warn(`note: schema matches but production /version does not contain expected SHA ${EXPECTED_SHA}`);
    }
  }
  process.exit(0);
}

console.log(`schema drift on /version between ${BASE_URL} and ${BASELINE_URL}`);
for (const d of diffs) console.log(`  ${d}`);
console.log('----- production -----');
console.log(JSON.stringify(prod, null, 2));
console.log('----- baseline -----');
console.log(JSON.stringify(base, null, 2));

process.exit(1);
