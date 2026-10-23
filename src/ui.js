// Pequenos utilitários de interface no padrão visual Freedom.
import * as XLSX from 'xlsx';
import { Capacitor } from '@capacitor/core';

// append/replaceChildren ignoram null/false (evita aparecer "null" na tela)
for (const m of ['append', 'replaceChildren', 'prepend']) {
  const orig = Element.prototype[m];
  Element.prototype[m] = function (...nos) { return orig.apply(this, nos.filter(n => n !== null && n !== undefined && n !== false)); };
}

export function h(tag, attrs = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const f of filhos.flat(Infinity)) {
    if (f === null || f === undefined || f === false) continue;
    el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
  return el;
}

// ---------- Formatos brasileiros ----------
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const moeda = (v) => (v === null || v === undefined || isNaN(v)) ? '—' : brl.format(v);
export const moedaCurta = (v) => {
  if (isNaN(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e6) return 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' mi';
  if (a >= 1e4) return 'R$ ' + Math.round(v / 1e3).toLocaleString('pt-BR') + ' mil';
  return moeda(v);
};
export const pctFmt = (v, casas = 2) => (v === null || v === undefined || isNaN(v)) ? '—' : (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas }) + '%';
export const numFmt = (v) => isNaN(v) ? '—' : Number(v).toLocaleString('pt-BR');
export const dataHora = (d = new Date()) => d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
// Datas "AAAA-MM-DD" sem hora são lidas no fuso local (senão viram o dia anterior)
export const lerData = (s) => {
  if (!s) return new Date(NaN);
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  const br = String(s).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return new Date(+br[3], +br[2] - 1, +br[1]);
  return new Date(s);
};
export const dataCurta = (s) => { const d = lerData(s); return isNaN(d) ? (s || '—') : d.toLocaleDateString('pt-BR'); };

// ---------- Componentes ----------
export const card = (...filhos) => h('section', { class: 'card' }, ...filhos);
export const rotulo = (txt) => h('div', { class: 'rotulo' }, txt);
export const chip = (txt, tipo = '') => h('span', { class: 'chip ' + tipo }, txt);

export function campo(label, input, ajuda) {
  return h('label', { class: 'campo' }, h('span', {}, label), input, ajuda ? h('small', {}, ajuda) : null);
}
export function select(opcoes, valor, attrs = {}) {
  return h('select', attrs, opcoes.map(o => {
    const [v, txt] = Array.isArray(o) ? o : [o, o];
    return h('option', { value: v, selected: String(v) === String(valor) }, txt);
  }));
}
export function botao(txt, onclick, tipo = 'primario', attrs = {}) {
  return h('button', { class: 'botao ' + tipo, type: 'button', onclick, ...attrs }, txt);
}

export function aviso(txt, tipo = 'atencao') {
  const icones = { atencao: '!', ok: '✓', erro: '✕', info: 'i' };
  return h('div', { class: 'aviso ' + tipo }, h('b', { class: 'aviso-ic' }, icones[tipo] || 'i'), h('div', {}, txt));
}

export function vazio(titulo, texto) {
  return h('div', { class: 'vazio' }, h('b', {}, titulo), texto ? h('p', {}, texto) : null);
}

export function carregando(txt = 'Consultando o Tributei…') {
  return h('div', { class: 'carregando' }, h('i', { class: 'spin' }), txt);
}

// Tabela com rolagem lateral dentro do cartão
export function tabela(colunas, linhas, { classeLinha, vazioTxt = 'Nada para mostrar.' } = {}) {
  if (!linhas.length) return vazio(vazioTxt);
  return h('div', { class: 'tabela-wrap' },
    h('table', { class: 'tabela' },
      h('thead', {}, h('tr', {}, colunas.map(c => h('th', { class: c.num ? 'num' : '' }, c.titulo)))),
      h('tbody', {}, linhas.map((l, i) => h('tr', { class: classeLinha ? classeLinha(l, i) : '' },
        colunas.map(c => {
          const v = c.valor ? c.valor(l, i) : l[c.chave];
          return h('td', { class: c.num ? 'num' : '' }, v instanceof Node ? v : (v ?? '—'));
        }))))));
}

// Tabela automática a partir de uma lista de objetos qualquer
export function tabelaAuto(itens, { max = 200, colunasMax = 14 } = {}) {
  const flats = itens.slice(0, max).map(o => achatarSimples(o));
  const chaves = [];
  for (const f of flats) for (const k of Object.keys(f)) if (!chaves.includes(k)) chaves.push(k);
  const cols = chaves.slice(0, colunasMax).map(k => ({ titulo: k, chave: k, num: flats.some(f => typeof f[k] === 'number') }));
  return tabela(cols, flats);
}
function achatarSimples(o, p = '', out = {}) {
  for (const [k, v] of Object.entries(o || {})) {
    const nome = p ? p + '.' + k : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && !p) achatarSimples(v, nome, out);
    else out[nome] = Array.isArray(v) ? `[${v.length}]` : (v && typeof v === 'object' ? '{…}' : v);
  }
  return out;
}

export function jsonBruto(obj, titulo = 'Resposta completa do Tributei') {
  const txt = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
  return h('details', { class: 'bruto' },
    h('summary', {}, titulo),
    h('div', { class: 'bruto-acoes' }, botao('Copiar', async (e) => {
      try { await navigator.clipboard.writeText(txt); e.target.textContent = 'Copiado ✓'; } catch { e.target.textContent = 'Não deu para copiar'; }
    }, 'secundario pequeno')),
    h('pre', {}, txt.length > 200000 ? txt.slice(0, 200000) + '\n…' : txt));
}

let toastTimer;
export function toast(msg, tipo = '') {
  let el = document.getElementById('toast');
  if (!el) { el = h('div', { id: 'toast' }); document.body.append(el); }
  el.className = 'show ' + tipo; el.textContent = msg;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (el.className = ''), 3200);
}

// Mostra o erro de forma amigável dentro de um container
export function mostrarErro(container, err) {
  container.replaceChildren(aviso(err.message || String(err), 'erro'), err.corpo ? jsonBruto(err.corpo, 'Detalhes do erro') : null);
}

// ---------- Arquivos ----------
export function lerArquivo(file) {
  return new Promise((ok, falha) => {
    const r = new FileReader();
    r.onload = () => ok({ nome: file.name, data: r.result, texto: new TextDecoder('utf-8').decode(r.result) });
    r.onerror = () => falha(r.error);
    r.readAsArrayBuffer(file);
  });
}

// Exporta planilhas (abas: [{ nome, linhas: [[...], ...] }])
export async function exportarXlsx(nomeArquivo, abas) {
  const wb = XLSX.utils.book_new();
  for (const a of abas) {
    const ws = XLSX.utils.aoa_to_sheet(a.linhas);
    ws['!cols'] = (a.linhas[0] || []).map((_, i) => ({ wch: Math.min(48, Math.max(8, ...a.linhas.slice(0, 200).map(l => String(l[i] ?? '').length + 2))) }));
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, ws, a.nome.slice(0, 31));
  }
  const base64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
  return salvarArquivo(nomeArquivo, base64, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

export async function salvarArquivo(nome, base64, mime) {
  if (window.freedomDesktop) {
    const ok = await window.freedomDesktop.salvarArquivo(nome, base64);
    if (ok) toast('Arquivo salvo', 'ok');
    return;
  }
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const r = await Filesystem.writeFile({ path: nome, data: base64, directory: Directory.Cache });
    await Share.share({ title: nome, url: r.uri, dialogTitle: 'Salvar ou enviar' });
    return;
  }
  const a = h('a', { href: `data:${mime};base64,${base64}`, download: nome });
  document.body.append(a); a.click(); a.remove();
}

export const carimbo = () => {
  const d = new Date(); const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
};
