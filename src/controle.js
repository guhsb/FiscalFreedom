// Controle remoto pelo GitHub (mesmo arquivo dos outros apps Freedom):
// https://github.com/guhsb/APPS-FREEDOM/blob/main/controle.json
// { "bloqueado": false, "mensagem": "", "bloquear": [], "versaoMinima": "" }
//  - bloqueado: true      -> desativa TODOS os apps
//  - bloquear: ["fiscal"] -> desativa só este app
//  - versaoMinima: "1.1.0"-> obriga a atualizar quem estiver abaixo
import { version } from '../package.json';

export const APP_ID = 'fiscal';
export const APP_VERSAO = version;
const URL_CONTROLE = 'https://raw.githubusercontent.com/guhsb/APPS-FREEDOM/main/controle.json';
const CACHE = 'ffiscal.controle';

const comparar = (a, b) => {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0), pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; }
  return 0;
};

export function avaliar(c) {
  if (!c) return { liberado: true };
  const lista = (Array.isArray(c.bloquear) ? c.bloquear : []).map(x => String(x).toLowerCase().trim());
  const msg = (c.mensagem || '').trim();
  if (c.bloqueado === true) return { liberado: false, titulo: 'App desativado', texto: msg || 'O acesso aos apps Freedom está suspenso no momento.' };
  if (lista.some(x => ['fiscal', 'freedom-fiscal', 'freedomfiscal', 'tributei', 'todos', '*'].includes(x))) {
    return { liberado: false, titulo: 'App desativado', texto: msg || 'O Freedom Fiscal está desativado no momento.' };
  }
  if (c.versaoMinima && comparar(APP_VERSAO, c.versaoMinima) < 0) {
    return { liberado: false, titulo: 'Atualize o app', texto: msg || `Esta versão (${APP_VERSAO}) não é mais aceita. Instale a versão ${c.versaoMinima} ou mais nova.`, atualizar: true };
  }
  return { liberado: true };
}

// Busca o controle. Sem internet, vale o último estado conhecido.
export async function verificar() {
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(URL_CONTROLE + '?t=' + Date.now(), { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const c = await r.json();
    try { localStorage.setItem(CACHE, JSON.stringify(c)); } catch {}
    return avaliar(c);
  } catch {
    let c = null;
    try { c = JSON.parse(localStorage.getItem(CACHE) || 'null'); } catch {}
    return avaliar(c);
  }
}
