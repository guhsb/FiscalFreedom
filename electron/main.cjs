// Processo principal do app de PC (Windows).
// As chamadas à API do Tributei saem daqui (Node), não da tela, para não esbarrar em CORS
// e para a chave da API ficar guardada criptografada pelo Windows (safeStorage).
const { app, BrowserWindow, ipcMain, safeStorage, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const HOSTS_PERMITIDOS = ['api.tributei.net', 'apisaidas.tributei.net'];
const arquivoChave = () => path.join(app.getPath('userData'), 'chave.bin');

function criarJanela() {
  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 380,
    backgroundColor: '#eef2f7',
    title: 'Freedom Fiscal',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  // Links externos abrem no navegador padrão
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

ipcMain.handle('tributei:request', async (_e, req) => {
  const url = new URL(req.url);
  if (url.protocol !== 'https:' || !HOSTS_PERMITIDOS.includes(url.hostname)) {
    return { status: 0, body: 'Endereço não permitido: ' + url.hostname };
  }
  const headers = { ...(req.headers || {}) };
  let body;
  if (req.form) {
    const fd = new FormData();
    for (const campo of req.form) {
      if (campo.data) {
        fd.append(campo.name, new Blob([Buffer.from(campo.data)], { type: campo.type || 'application/xml' }), campo.filename || 'arquivo.xml');
      } else {
        fd.append(campo.name, String(campo.value ?? ''));
      }
    }
    body = fd;
    delete headers['Content-Type'];
  } else if (req.json !== undefined) {
    body = JSON.stringify(req.json);
    headers['Content-Type'] = 'application/json';
  }
  try {
    const res = await fetch(url, { method: req.method || 'GET', headers, body });
    return { status: res.status, body: await res.text() };
  } catch (err) {
    return { status: 0, body: 'Sem conexão com o Tributei: ' + err.message };
  }
});

ipcMain.handle('chave:ler', () => {
  try {
    const buf = fs.readFileSync(arquivoChave());
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8');
  } catch { return ''; }
});

ipcMain.handle('chave:salvar', (_e, chave) => {
  const f = arquivoChave();
  if (!chave) { try { fs.unlinkSync(f); } catch {} return true; }
  const buf = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(chave) : Buffer.from(chave, 'utf8');
  fs.writeFileSync(f, buf);
  return true;
});

ipcMain.handle('arquivo:salvar', async (_e, { nome, base64 }) => {
  const { dialog } = require('electron');
  const r = await dialog.showSaveDialog({ defaultPath: nome });
  if (r.canceled || !r.filePath) return false;
  fs.writeFileSync(r.filePath, Buffer.from(base64, 'base64'));
  shell.showItemInFolder(r.filePath);
  return true;
});

app.whenReady().then(() => {
  criarJanela();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) criarJanela(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
