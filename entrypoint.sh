#!/bin/sh
# muse-box entrypoint: install authorized_keys, start sshd + tailscaled (userspace), then tailscale up.
set -u

# /home/muse is a tmpfs: recreate layout and flow the public key in from /config.
mkdir -p /home/muse/.ssh
chown muse:muse /home/muse /home/muse/.ssh
chmod 755 /home/muse
if [ -f /config/authorized_keys ]; then
  cp /config/authorized_keys /home/muse/.ssh/authorized_keys
  chown muse:muse /home/muse/.ssh/authorized_keys
  chmod 700 /home/muse/.ssh
  chmod 600 /home/muse/.ssh/authorized_keys
fi
chown muse:muse /work 2>/dev/null || true
chown root:root /var/lib/tailscale 2>/dev/null || true
chmod 700 /var/lib/tailscale 2>/dev/null || true

/usr/sbin/sshd

mkdir -p /var/run/tailscale
tailscaled --tun=userspace-networking \
  --state=/var/lib/tailscale/tailscaled.state \
  --socket=/var/run/tailscale/tailscaled.sock &
TS_PID=$!

i=0
while [ ! -S /var/run/tailscale/tailscaled.sock ] && [ $i -lt 30 ]; do
  sleep 1; i=$((i + 1))
done

# First run blocks until the user completes login (URL is printed to stdout -> docker logs).
# With an existing state this returns immediately without re-auth.
until tailscale --socket=/var/run/tailscale/tailscaled.sock up --hostname=muse-box --accept-dns=false; do
  echo "muse-box: tailscale up not complete; retrying in 5s" >&2
  sleep 5
done

# Keep PID 1 alive on tailscaled; if it dies the container exits and restart policy revives it.
wait $TS_PID
