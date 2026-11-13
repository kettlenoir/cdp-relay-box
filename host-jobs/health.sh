#!/bin/sh
# muse-box no health watch: start it if down, restart only if tailscale is unhealthy.
# Healthy states: Running (logged in) and NeedsLogin (waiting for first user approval).
# No output by design.
BOX=muse-box

running=$(docker inspect -f '{{.State.Running}}' "$BOX" 2>/dev/null) || exit 0
if [ "$running" != "true" ]; then
  docker start "$BOX" >/dev/null 2>&1
  exit 0
fi

# Grace period: do not judge within 3 minutes of container start.
started_s=$(date -u -d "$(docker inspect -f '{{.State.StartedAt}}' "$BOX" 2>/dev/null)" +%s 2>/dev/null || echo 0)
now_s=$(date -u +%s)
if [ $((now_s - started_s)) -lt 180 ]; then
  exit 0
fi

backend=$(docker exec "$BOX" tailscale status --json 2>/dev/null \
  | sed -n 's/.*"BackendState": *"\([^"]*\)".*/\1/p' | head -n 1)
case "$backend" in
  Running|NeedsLogin) exit 0 ;;
  *) docker restart "$BOX" >/dev/null 2>&1 ;;
esac
exit 0
