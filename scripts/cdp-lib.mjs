// Minimal CDP helper for nb3 Chrome.
// Endpoint is configurable via env: CDP_HOST / CDP_PORT.
// Default: the muse-net CDP relay on the host (172.31.0.1:9222), which forwards to Chrome's 127.0.0.1:9222.
const CDP_HOST = process.env.CDP_HOST || '172.31.0.1';
const CDP_PORT = process.env.CDP_PORT || '9222';
export async function listTargets() {
  const r = await fetch(`http://${CDP_HOST}:${CDP_PORT}/json/list`);
  return r.json();
}
export async function connect(wsUrl) {
  const u = new URL(wsUrl);
  u.hostname = CDP_HOST;
  u.port = CDP_PORT;
  const ws = new WebSocket(u.toString());
  let seq = 0; const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const send = (method, params = {}) => new Promise((resolve) => {
    const id = ++seq; pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evalJs = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 600));
    return r.result?.result?.value;
  };
  return { ws, send, evalJs };
}
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
