import { app, BrowserWindow } from "electron";

app.whenReady().then(async () => {
  app.setAccessibilitySupportEnabled(true);
  const window = new BrowserWindow({
    width: 800,
    height: 700,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  await window.loadURL(
    `data:text/html,${encodeURIComponent(`<!doctype html>
<html><head><title>Owned browser email fixture</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'"></head>
<body><h1>Draft for Robin</h1><p>Discuss Friday's design review. Leave the draft unsent.</p>
<label>Recipient <input id="recipient" value="robin@example.com"></label><br>
<label>Subject <input id="subject"></label><br>
<label>Message body <textarea id="body" rows="5" cols="60"></textarea></label>
<div role="textbox" aria-label="Rich message" id="rich" contenteditable="true" style="min-height:70px;border:1px solid">Original text</div>
<label>Protected fixture <input type="password" value="never-expose-browser-secret"></label>
<button id="save">Save draft</button><button id="send">Send message</button><output id="status">Unsent</output>
<script>window.enterKeys=0; document.addEventListener('keydown', event=>{if(event.key==='Enter' && !event.shiftKey)window.enterKeys++});
window.inputEvents=[]; document.addEventListener('input', event=>window.inputEvents.push(event.target.id));
document.querySelector('#save').onclick=()=>document.querySelector('#status').textContent='Saved, unsent';
document.querySelector('#send').onclick=()=>document.querySelector('#status').textContent='Sent';</script></body></html>`)}`,
  );
  globalThis.ownedEditorSource = window.getMediaSourceId();
});
app.on("window-all-closed", () => app.quit());
