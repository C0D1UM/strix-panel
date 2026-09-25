#!/bin/sh
# Stands in for the docker CLI in tests. Appends each call's argv (one line, space-separated) to $FAKE_DOCKER_LOG
# and answers `ps` from $FAKE_DOCKER_PS (newline-separated). FAKE_DOCKER_FAIL=rm makes `docker rm` fail.
set -eu
echo "$*" >> "$FAKE_DOCKER_LOG"
case "$1" in
  ps) printf '%s' "${FAKE_DOCKER_PS:-}" ;;
  rm)
    if [ "${FAKE_DOCKER_FAIL:-}" = rm ]; then
      echo "cannot remove container" >&2
      exit 1
    fi
    ;;
esac
