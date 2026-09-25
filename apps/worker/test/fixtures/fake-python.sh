#!/bin/sh
# Stands in for Strix's Python in tests: `fake-python.sh -c <script> <run dir> <output>`. Writes a fake PDF built
# from the run dir's run.json, or fails like a Python traceback when FAKE_PYTHON_FAIL is set.
set -eu
if [ -n "${FAKE_PYTHON_FAIL:-}" ]; then
  echo 'Traceback (most recent call last):' >&2
  echo "ModuleNotFoundError: No module named 'strix.interface.viewer.report_pdf'" >&2
  exit 1
fi
# exec, so the timeout kills the process holding stderr (like the real single-process Python).
[ -n "${FAKE_PYTHON_SLEEP:-}" ] && exec sleep "$FAKE_PYTHON_SLEEP"
{ printf '%%PDF-fake '; cat "$3/run.json"; } > "$4"
