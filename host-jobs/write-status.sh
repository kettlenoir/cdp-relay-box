#!/usr/bin/env bash
# nb3 の状態を JSON で共有フォルダ (my_vault/kvm/sshfs/muse/status.json) に書き出す。
# Muse は muse-box の /shared 経由でこのファイルを読む (ホストへの直接アクセスの代替)。
set -u

OUT_DIR="$HOME/cloud/my_vault/kvm/sshfs/muse"
mkdir -p "$OUT_DIR"
TMP="$OUT_DIR/.status.json.tmp.$$"
trap 'rm -f "$TMP"' EXIT

python3 - <<'PYEOF' > "$TMP"
import json, subprocess, datetime, os

def sh(cmd):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=30).stdout.strip()
    except Exception:
        return ""

mem = {}
try:
    for line in open('/proc/meminfo'):
        parts = line.split()
        if len(parts) >= 2:
            mem[parts[0].rstrip(':')] = int(parts[1])  # kB
except Exception:
    pass
mem_total = mem.get('MemTotal', 0)
mem_avail = mem.get('MemAvailable', 0)
mem_used = mem_total - mem_avail

disk = {}
try:
    st = os.statvfs('/')
    disk = {
        'total_gb': round(st.f_blocks * st.f_frsize / 1e9, 1),
        'used_gb': round((st.f_blocks - st.f_bfree) * st.f_frsize / 1e9, 1),
        'free_gb': round(st.f_bavail * st.f_frsize / 1e9, 1),
        'use_percent': round((st.f_blocks - st.f_bfree) / st.f_blocks * 100, 1) if st.f_blocks else None,
    }
except Exception:
    pass

containers = []
out = sh(['docker', 'ps', '--format', '{{.Names}}\t{{.Status}}'])
for line in out.splitlines():
    if '\t' in line:
        name, status = line.split('\t', 1)
        containers.append({'name': name, 'status': status})

load = None
try:
    load = [float(x) for x in open('/proc/loadavg').read().split()[:3]]
except Exception:
    pass

data = {
    'hostname': sh(['hostname']),
    'timestamp': datetime.datetime.now().astimezone().isoformat(timespec='seconds'),
    'uptime': sh(['uptime', '-p']),
    'loadavg': load,
    'memory': {
        'total_mb': mem_total // 1024,
        'used_mb': mem_used // 1024,
        'available_mb': mem_avail // 1024,
        'use_percent': round(mem_used / mem_total * 100, 1) if mem_total else None,
    },
    'disk_root': disk,
    'kernel': sh(['uname', '-r']),
    'containers': containers,
}
print(json.dumps(data, ensure_ascii=False, indent=2))
PYEOF

mv "$TMP" "$OUT_DIR/status.json"
rclone copyto "$OUT_DIR/status.json" "dropbox:muse/bridge-to-muse/_status.json" >/dev/null 2>&1 || true
trap - EXIT
