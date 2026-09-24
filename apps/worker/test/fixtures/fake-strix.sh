#!/bin/sh
# Stands in for the Strix CLI in tests. Writes the files the worker polls, driven by FAKE_STRIX_SCENARIO:
#   completed  - usage, two agents, one finding, a report, then exits 0 with status completed
#   failed     - exits 2 without completing
#   hang       - runs until signalled, then writes status interrupted (like Strix on SIGINT)
set -eu
run=strix_runs/example-com_ab12
mkdir -p "$run/.state"
printf '%s\n' "$@" > argv.txt

write_run() {
  cat > "$run/run.json" <<JSON
{"run_name":"example-com_ab12","status":"$1","llm_usage":{"requests":$2,"input_tokens":$3,"output_tokens":$4,"input_tokens_details":{"cached_tokens":$5},"cost":$6}}
JSON
}

write_run running 1 1000 200 100 0.0123
echo '{"statuses":{"root":"running"},"names":{"root":"StrixAgent"},"parent_of":{"root":null},"errors":{}}' > "$run/.state/agents.json"
echo "startup line"

case "${FAKE_STRIX_SCENARIO:-completed}" in
  completed)
    sleep 0.4
    echo '{"statuses":{"root":"running","child":"running"},"names":{"root":"StrixAgent","child":"recon"},"parent_of":{"root":null,"child":"root"},"errors":{}}' > "$run/.state/agents.json"
    cat > "$run/vulnerabilities.json" <<'JSON'
[{"id":"vuln-0001","title":"Reflected XSS","severity":"high","timestamp":"2026-09-24T10:00:00+00:00","target":"https://example.com/","endpoint":"/search","method":"GET","cvss":7.1,"description":"Input is reflected.","remediation_steps":"Encode output."}]
JSON
    write_run running 3 5000 900 2000 0.2
    sleep 0.4
    echo '{"statuses":{"root":"completed","child":"failed"},"names":{"root":"StrixAgent","child":"recon"},"parent_of":{"root":null,"child":"root"},"errors":{"child":"boom"}}' > "$run/.state/agents.json"
    printf '# Security Penetration Test Report\n\nAll good.\n' > "$run/penetration_test_report.md"
    write_run completed 4 6000 1000 2500 0.25
    exit 0
    ;;
  failed)
    sleep 0.2
    echo "Error during penetration test: no LLM configured" >&2
    exit 2
    ;;
  hang)
    sleep 30 &
    child=$!
    trap 'kill $child 2>/dev/null; write_run interrupted 1 1000 200 100 0.0123; exit 130' INT TERM
    wait $child || true
    ;;
esac
