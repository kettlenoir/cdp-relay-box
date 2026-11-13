import { listTargets, connect, sleep } from './cdp-lib.mjs';
import { writeFileSync, readFileSync } from 'node:fs';
const cfg = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const targets = await listTargets();
const tab = targets.find(t => t.type === 'page' && t.url.includes('flow.google.com'));
const { ws, send, evalJs } = await connect(tab.webSocketDebuggerUrl);
await send('Page.enable'); await send('DOM.enable');
let chooserResolve = null;
const prev = ws.onmessage;
ws.onmessage = (ev) => { prev(ev); try { const m = JSON.parse(ev.data); if (m.method === 'Page.fileChooserOpened' && chooserResolve) { const r = chooserResolve; chooserResolve = null; r(m.params); } } catch {} };
function waitChooser(ms) { return new Promise((res) => { chooserResolve = res; setTimeout(() => { if (chooserResolve === res) { chooserResolve = null; res(null); } }, ms); }); }
async function click(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}
async function key(k, code, mods) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, modifiers: mods || 0 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, modifiers: mods || 0 }); }
// --- new project
await send('Page.navigate', { url: 'https://flow.google.com/' });
let np = null;
for (let tries = 0; tries < 4 && !np; tries++) {
  await sleep(5000);
  np = await evalJs(`(() => { const els = [...document.querySelectorAll('button, a, div')].filter(e => (e.innerText || '').includes('新しいプロジェクト')); const el = els.sort((a, b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width)[0]; if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })()`);
  console.log(cfg.tag, 'new-project lookup try', tries + 1, JSON.stringify(np));
}
if (!np) { console.log(cfg.tag, 'ABORT no new-project'); process.exit(1); }
await click(np.x, np.y);
await sleep(6000);
const projectUrl = await evalJs(`location.href`);
console.log(cfg.tag, 'project:', projectUrl);
const ck = await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(e => (e.innerText || '').trim() === '同意しない'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })()`);
if (ck) { await click(ck.x, ck.y); await sleep(800); }
// --- uploads
const barThumbs = async () => await evalJs(`(() => [...document.querySelectorAll('img')].filter(i => { const r = i.getBoundingClientRect(); return r.y > 800 && r.width >= 20 && r.width <= 90; }).length)()`);
await send('Page.setInterceptFileChooserDialog', { enabled: true });
for (const f of cfg.files) {
  const before = await barThumbs();
  const addPos = await evalJs(`(() => { const bs = [...document.querySelectorAll('button')].filter(e => (e.innerText || '').trim() === 'add'); const b = bs.sort((a, b2) => b2.getBoundingClientRect().y - a.getBoundingClientRect().y)[0]; if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })()`);
  await click(addPos.x, addPos.y);
  await sleep(2000);
  const upBtn = await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(e => (e.innerText || '').includes('メディアをアップロード')); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })()`);
  if (!upBtn) { console.log(cfg.tag, 'ABORT no upload btn', f.name); process.exit(1); }
  const chooserP = waitChooser(12000);
  await click(upBtn.x, upBtn.y);
  const chooser = await chooserP;
  if (!chooser) { console.log(cfg.tag, 'ABORT no chooser', f.name); process.exit(1); }
  const hr = await send('DOM.setFileInputFiles', { files: [f.path], backendNodeId: chooser.backendNodeId });
  if (hr.error) { console.log(cfg.tag, 'ABORT setFiles', JSON.stringify(hr.error)); process.exit(1); }
  for (let i = 0; i < 30; i++) { await sleep(2000); const pct = await evalJs(`(() => (document.body.innerText.match(/\\d+\\s?%/g) || []).length)()`); if (pct === 0) break; }
  await sleep(1500);
  const item = await evalJs(`(() => { const el = [...document.querySelectorAll('div, li, button')].filter(e => { const t = (e.innerText || '').trim(); return t.startsWith(${JSON.stringify(f.name)}) && e.getBoundingClientRect().width < 520; }).sort((a, b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width)[0]; if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })()`);
  if (!item) { console.log(cfg.tag, 'ABORT picker item', f.name); process.exit(1); }
  await click(item.x, item.y);
  await sleep(1200);
  const btn = await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(e => (e.innerText || '').trim() === 'プロンプトに追加'); if (!b || b.disabled) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })()`);
  if (btn) { await click(btn.x, btn.y); await sleep(2000); }
  const after = await barThumbs();
  console.log(cfg.tag, f.name, 'thumbs', before, '->', after);
  if (after !== before + 1) { console.log(cfg.tag, 'ABORT thumb mismatch', f.name); process.exit(1); }
}
await send('Page.setInterceptFileChooserDialog', { enabled: false });
// --- aspect 1:1
const chip = await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(e => (e.innerText || '').includes('Nano Banana')); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })()`);
await click(chip.x, chip.y);
await sleep(1800);
const sq = await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(e => (e.innerText || '').includes('crop_square')); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })()`);
if (!sq) { console.log(cfg.tag, 'ABORT no 1:1 button'); process.exit(1); }
await click(sq.x, sq.y);
await sleep(800);
await key('Escape', 'Escape');
await sleep(600);
const chip2 = await evalTsSafe();
async function evalTsSafe() { return await evalJs(`(() => [...document.querySelectorAll('button')].map(b => (b.innerText || '').trim()).find(t => t.includes('Nano')) || null)()`); }
console.log(cfg.tag, 'chip now:', chip2);
// --- prompt + generate
await key('Escape', 'Escape');
await sleep(800);
let focused = false;
let txt = '';
for (let attempt = 0; attempt < 3 && !focused; attempt++) {
  const ce = await evalJs(`(() => { const e = document.querySelector('[contenteditable="true"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })()`);
  if (!ce) { await sleep(1500); continue; }
  await click(ce.x, ce.y);
  await sleep(600);
  for (const ch of 'TEST') await send('Input.dispatchKeyEvent', { type: 'char', text: ch, unmodifiedText: ch });
  await sleep(400);
  txt = await evalJs(`(() => document.querySelector('[contenteditable="true"]').innerText)()`);
  focused = txt.includes('TEST');
  console.log(cfg.tag, 'focus attempt', attempt + 1, focused);
}
if (!focused) { console.log(cfg.tag, 'ABORT focus'); process.exit(1); }
await key('a', 'KeyA', 2); await key('Backspace', 'Backspace');
await sleep(300);
for (const ch of cfg.prompt) await send('Input.dispatchKeyEvent', { type: 'char', text: ch, unmodifiedText: ch });
await sleep(600);
txt = await evalJs(`(() => document.querySelector('[contenteditable="true"]').innerText)()`);
console.log(cfg.tag, 'prompt len:', txt.length);
if (txt.length < cfg.prompt.length * 0.9) { console.log(cfg.tag, 'ABORT prompt short'); process.exit(1); }
const genBtn = await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(e => (e.innerText || '').trim() === 'arrow_forward'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })()`);
await click(genBtn.x, genBtn.y);
console.log(cfg.tag, 'GENERATE CLICKED', new Date().toISOString());
// --- wait for completion, collect generated URLs
const fileCount = cfg.files.length;
for (let i = 0; i < 20; i++) {
  await sleep(15000);
  const st = await evalJs(`(() => { const pct = (document.body.innerText.match(/\\d+\\s?%/g) || []); const imgs = [...document.querySelectorAll('img')].map(im => im.src).filter(s => s && s.length > 30); return { p: pct.length, n: imgs.length }; })()`);
  console.log(cfg.tag, `wait t+${(i + 1) * 15}s`, JSON.stringify(st));
  if (st.p === 0 && st.n >= fileCount + 4) break;
}
const urls = await evalJs(`(() => { const s = [...document.querySelectorAll('img')].map(im => im.src).filter(x => x.includes('flow-content.google/image')); return [...new Set(s)]; })()`);
const byExp = {};
for (const u of urls) { const e = new URL(u).searchParams.get('Expires'); (byExp[e] = byExp[e] || []).push(u); }
const latest = Object.keys(byExp).sort().pop();
writeFileSync(`/home/hatch/workspace/flow-single-${cfg.tag}.json`, JSON.stringify({ project: projectUrl, generated: byExp[latest] }, null, 1));
console.log(cfg.tag, 'DONE generated:', byExp[latest].length);
process.exit(0);
