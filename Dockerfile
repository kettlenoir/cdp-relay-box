FROM node:22-alpine

RUN apk add --no-cache openssh tailscale curl \
 && adduser -D -s /bin/sh -h /home/muse muse \
 && sed -i 's/^muse:!/muse:*/' /etc/shadow \
 && ssh-keygen -A \
 && printf '%s\n' \
      'Port 22' \
      'PermitRootLogin no' \
      'PasswordAuthentication no' \
      'KbdInteractiveAuthentication no' \
      'PubkeyAuthentication yes' \
      'AllowUsers muse' \
      'UsePAM no' \
      'PrintMotd no' \
      'Subsystem sftp /usr/lib/ssh/sftp-server' \
      > /etc/ssh/sshd_config \
 && mkdir -p /app /work \
 && mkdir -p /var/lib/tailscale && chown root:root /var/lib/tailscale && chmod 700 /var/lib/tailscale

COPY --chmod=755 scripts/ /app/scripts/
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

WORKDIR /work
ENTRYPOINT ["/entrypoint.sh"]
