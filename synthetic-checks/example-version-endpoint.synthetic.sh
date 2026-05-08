#!/usr/bin/env bash
# example-version-endpoint.synthetic.sh
#
# Reference synthetic check for the synthetic-checks/ directory convention.
# Hits /version on $BASE_URL and $BASELINE_URL and diffs the JSON payloads.
# Exit 0 if they agree on every key. Exit 1 if they drift, with the diff
# printed to stdout so the verification-loop runner can include it
# verbatim in the report.
#
# Copy this file, rename it (e.g. cp example-version-endpoint.synthetic.sh
# version.synthetic.sh), point it at your project's actual version endpoint,
# and adjust the diff dimensions for your payload shape.
#
# Inputs (set by the verification-loop runner):
#   BASE_URL       Production base URL (required)
#   BASELINE_URL   Staging baseline URL (required)
#   EXPECTED_SHA   Merge SHA the deploy receipt reported COMPLETE (optional)
#
# Exit codes:
#   0   Production matches baseline on /version
#   1   Drift detected; stdout has the diff
#   2   Configuration error (missing input, endpoint unreachable)

set -u

if [[ -z "${BASE_URL:-}" || -z "${BASELINE_URL:-}" ]]; then
  echo "configuration error: BASE_URL and BASELINE_URL must both be set" >&2
  exit 2
fi

prod_payload=$(curl -fsS --max-time 10 "${BASE_URL%/}/version" 2>&1) || {
  echo "configuration error: could not reach ${BASE_URL%/}/version: ${prod_payload}" >&2
  exit 2
}

baseline_payload=$(curl -fsS --max-time 10 "${BASELINE_URL%/}/version" 2>&1) || {
  echo "configuration error: could not reach ${BASELINE_URL%/}/version: ${baseline_payload}" >&2
  exit 2
}

if [[ "${prod_payload}" == "${baseline_payload}" ]]; then
  exit 0
fi

echo "drift on /version between ${BASE_URL} and ${BASELINE_URL}"
echo "----- production -----"
echo "${prod_payload}"
echo "----- baseline -----"
echo "${baseline_payload}"

if [[ -n "${EXPECTED_SHA:-}" ]]; then
  if echo "${prod_payload}" | grep -q "${EXPECTED_SHA}"; then
    echo "note: production /version contains expected SHA ${EXPECTED_SHA}"
  else
    echo "warning: production /version does NOT contain expected SHA ${EXPECTED_SHA}"
  fi
fi

exit 1
