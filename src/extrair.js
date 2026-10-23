// A documentação da API não mostra o formato das respostas.
// Estas funções procuram os campos pelo nome (de forma tolerante) para montar tabelas.
import { UFS } from './data.js';

export const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Acha todas as listas de objetos dentro da resposta (a maior primeiro)
export function listas(obj, max = 6) {
  const achadas = [];
  const visitar = (o, caminho, prof) => {
    if (!o || typeof o !== 'object' || prof > 6) return;
    if (Array.isArray(o)) {
      if (o.length && o.every(x => x && typeof x === 'object' && !Array.isArray(x))) achadas.push({ caminho, itens: o });
      o.slice(0, 50).forEach((x, i) => visitar(x, caminho + '[' + i + ']', prof + 1));
      return;
    }
    // objeto cujos valores são objetos parecidos (ex.: { "MT": {...}, "SP": {...} })
    const vals = Object.values(o);
    if (vals.length > 1 && vals.every(v => v && typeof v === 'object' && !Array.isArray(v))) {
      achadas.push({ caminho: caminho + '{}', itens: Object.entries(o).map(([k, v]) => ({ _chave: k, ...v })) });
    }
    for (const [k, v] of Object.entries(o)) visitar(v, caminho ? caminho + '.' + k : k, prof + 1);
  };
  visitar(obj, '', 0);
  return achadas.sort((a, b) => b.itens.length - a.itens.length).slice(0, max);
}

// Achata um objeto em { "a.b": valor } (até 2 níveis), útil para colunas
export function achatar(o, pref = '', prof = 0, out = {}) {
  for (const [k, v] of Object.entries(o || {})) {
    const nome = pref ? pref + '.' + k : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && prof < 2) achatar(v, nome, prof + 1, out);
    else if (Array.isArray(v)) out[nome] = v.length && typeof v[0] !== 'object' ? v.join(', ') : `[${v.length}]`;
    else out[nome] = v;
  }
  return out;
}

const PADROES = {
  uf: [/^(uf|estado|estadodest|ufdest|ufdestino|destino|estadodestino|siglauf)$/, /estadodest|ufdest/],
  ncm: [/^ncm$/, /ncm(codigo)?$/],
  cest: [/^cest$/, /cest(codigo)?$/],
  mva: [/^mva$/, /mvaajustad|mvaoriginal|mva/],
  aliqInterna: [/aliquotainterna|aliqinterna|aliqint$|picmsst|aliquotaintra/],
  aliqInter: [/interestadual|aliqinter$|aliquotainter$|picms$/],
  base: [/basecalculost|bcst|vbcst|baseicmsst|basest/],
  valorSt: [/^(vicmsst|valoricmsst|icmsst|valorst|vst|valoricmssubstituicao)$/, /valoricmsst|vicmsst|icmsstvalor|valorst$/],
  valorFcp: [/vfcpst|valorfcp|fcpst|vfcp/],
  quem: [/quemrecolhe|responsavel|recolhimento|recolhe/],
  protocolo: [/protocolo|baselegal|legislacao|convenio/],
  difal: [/^(vdifal|valordifal|difal|vicmsufdest|icmsufdest)$/, /valordifal|vdifal|icmsufdest/],
  total: [/^(valortotal|vtotal|totalprodutos|valortotaldeprodutos|vprod)$/],
  baseAntes: [/basecalculoantes|baseantesmva|vbc$/]
};

function pegar(flat, campo) {
  const chaves = Object.keys(flat);
  for (const re of PADROES[campo]) {
    const k = chaves.find(c => re.test(norm(c.split('.').pop())));
    if (k !== undefined && flat[k] !== null && flat[k] !== '') return flat[k];
  }
  return undefined;
}

export const num = (v) => {
  if (v === null || v === undefined || v === '') return NaN;
  if (typeof v === 'number') return v;
  let s = String(v).replace(/[R$\s%]/g, '');
  if (/,\d{1,4}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  return Number(s);
};

// Linhas do simulador: { uf, ncm, cest, mva, aliqInterna, aliqInter, valorSt, valorFcp, quem, protocolo }
export function linhasSimulacao(resp) {
  const out = [];
  for (const l of listas(resp, 10)) {
    for (const item of l.itens) {
      const flat = achatar(item);
      let uf = pegar(flat, 'uf') ?? item._chave;
      uf = typeof uf === 'string' ? uf.trim().toUpperCase() : uf;
      const valorSt = pegar(flat, 'valorSt');
      const mva = pegar(flat, 'mva');
      const difal = pegar(flat, 'difal');
      if (!UFS.includes(uf) || (valorSt === undefined && mva === undefined && difal === undefined)) continue;
      out.push({
        uf, ncm: pegar(flat, 'ncm'), cest: pegar(flat, 'cest'),
        mva: pct(mva), aliqInterna: pct(pegar(flat, 'aliqInterna')), aliqInter: pct(pegar(flat, 'aliqInter')),
        base: num(pegar(flat, 'base')), valorSt: num(valorSt), valorFcp: num(pegar(flat, 'valorFcp')),
        quem: String(pegar(flat, 'quem') ?? '').toUpperCase(), protocolo: pegar(flat, 'protocolo') ?? '',
        difal: num(difal), total: num(pegar(flat, 'total')), baseAntes: num(pegar(flat, 'baseAntes')),
        bruto: item
      });
    }
    if (out.length) break;
  }
  return out;
}

// Percentual: aceita 0.4033, 40.33, "40.33%"
export function pct(v) {
  const n = num(v);
  if (isNaN(n)) return NaN;
  return n > 1 ? n / 100 : n;
}

// Diz se o ST é da Freedom (fornecedor recolhe e há valor)
export function temStFornecedor(l) {
  if (!l) return false;
  if (l.quem && /DESTINAT|ADQUIRENT|SEM ST|NAO|NÃO/.test(l.quem)) return false;
  if (l.quem && /FORNECED|REMETENT|EMITENT|SUBSTITUTO/.test(l.quem)) return (l.valorSt || 0) > 0 || !isNaN(l.mva);
  return (l.valorSt || 0) > 0;
}

export function valorPorNome(obj, ...regexes) {
  const flat = achatar(obj || {});
  for (const re of regexes) {
    const k = Object.keys(flat).find(c => re.test(norm(c.split('.').pop())));
    if (k !== undefined) return flat[k];
  }
  return undefined;
}
