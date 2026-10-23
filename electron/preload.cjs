const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('freedomDesktop', {
  request: (req) => ipcRenderer.invoke('tributei:request', req),
  lerChave: () => ipcRenderer.invoke('chave:ler'),
  salvarChave: (chave) => ipcRenderer.invoke('chave:salvar', chave),
  salvarArquivo: (nome, base64) => ipcRenderer.invoke('arquivo:salvar', { nome, base64 })
});
