import { listTargets, connect, sleep } from './cdp-lib.mjs';
let targets = await listTargets();
let tab = targets.find(t => t.type === 'page');
if (!tab) { console.log('NO_PAGE_TARGET'); process.exit(0); }
const { ws, send, evalJs } = await connect(tab.webSocketDebuggerUrl);
await send('Page.enable');
await send('Page.navigate', { url: 'https://flow.google.com/' });
await sleep(9000);
const url = await evalJs('location.href');
const text = await evalJs('document.body ? document.body.innerText.slice(0, 1500) : ""');
console.log('URL:', url);
console.log('TEXT:', JSON.stringify(text));
ws.close();
