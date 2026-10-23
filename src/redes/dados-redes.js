// Redes (clientes com mix e preços negociados), custos e cálculo de margem.
import SANDER from './rede-sander.json';
import CUSTOS_ENC from './custos.enc.json';
import * as M from '../motor/motor-st.js';
import { config } from '../store.js';
import { categoriaPorNcm } from '../data.js';
import { calcularSt } from '../calc.js';

const LS = 'ffiscal.redes.';
const ler = (k, p) => { try { const v = localStorage.getItem(LS + k); return v ? JSON.parse(v) : p; } catch { return p; } };
const gravar = (k, v) => { try { localStorage.setItem(LS + k, JSON.stringify(v)); return true; } catch { return false; } };

// ---------- Parâmetros da margem ----------
// Custos variáveis em % do preço de venda. O ICMS próprio é automático (4%, 7%, 12% ou interno).
export const CUSTOS_VAR_PADRAO = [
  { id: 'piscofins', nome: 'PIS/COFINS', pct: 3.65 },
  { id: 'comissao', nome: 'Comissão', pct: 0 },
  { id: 'frete', nome: 'Frete', pct: 0 },
  { id: 'financeiro', nome: 'Custo financeiro / prazo', pct: 0 },
  { id: 'verba', nome: 'Verba / marketing da rede', pct: 0 },
  { id: 'inadimplencia', nome: 'Inadimplência', pct: 0 },
  { id: 'administrativo', nome: 'Despesas administrativas', pct: 0 },
  { id: 'outros', nome: 'Outros', pct: 0 }
];
export const PARAMS_PADRAO = { icmsInterno: 12, custosVar: CUSTOS_VAR_PADRAO };
export const params = () => { const p = { ...PARAMS_PADRAO, ...ler('params', {}) }; const ids = p.custosVar.map(c => c.id); return { ...p, custosVar: [...p.custosVar, ...CUSTOS_VAR_PADRAO.filter(c => !ids.includes(c.id))] }; };
export const salvarParams = (p) => gravar('params', { ...params(), ...p });

// % de cada custo variável para uma rede (a rede pode sobrescrever o padrão)
export function custosVarRede(rd) {
  return params().custosVar.map(c => ({ ...c, pct: rd?.custosVar?.[c.id] ?? c.pct, daRede: rd?.custosVar?.[c.id] != null }));
}
export const totalCustosVar = (rd) => custosVarRede(rd).reduce((s, c) => s + (+c.pct || 0), 0) / 100;

// ---------- Custos (CSV de produtos do sistema) ----------
// { cod: { custo, venda, minimo, descMax, estoque, marca, desc } }
export const custos = () => ler('custos', {});
export const custosInfo = () => ler('custosInfo', null);

export function importarCustosCSV(texto, nomeArquivo = '') {
  const { header, rows } = M.parseCSV(texto);
  const col = (...n) => M.findCol(header, n);
  const ix = { cod: col('CODPRODUTO'), custo: col('PRECOCUSTO', 'CUSTO', 'CustoReal', 'CUSTOMEDIO', 'VLRCUSTO'), venda: col('PRECOVENDA', 'Preco'), min: col('PRECOMINIMO'), desc: col('PERCDESCMAX'), est: col('ESTOQUEATUAL', 'Estoque'), marca: col('Marca'), prod: col('PRODUTO'), sit: col('SITUACAO') };
  if (ix.cod < 0 || ix.custo < 0) throw new Error('Não achei as colunas CODPRODUTO e PRECOCUSTO (ou CUSTO).');
  const out = {}; let comCusto = 0;
  for (const r of rows) {
    const cod = (r[ix.cod] || '').trim(); if (!cod) continue;
    const n = (i) => i >= 0 ? M.toNum(r[i]) : NaN;
    const c = n(ix.custo);
    out[cod] = { custo: c > 0 ? c : null, venda: n(ix.venda) || null, minimo: n(ix.min) || null, descMax: n(ix.desc) || null, estoque: isNaN(n(ix.est)) ? null : n(ix.est), marca: ix.marca >= 0 ? (r[ix.marca] || '').trim() : '', desc: ix.prod >= 0 ? (r[ix.prod] || '').trim() : '', sit: ix.sit >= 0 ? (r[ix.sit] || '').trim() : '' };
    if (c > 0) comCusto++;
  }
  gravar('custos', out);
  gravar('custosInfo', { quando: new Date().toISOString(), arquivo: nomeArquivo, total: Object.keys(out).length, comCusto });
  // O mesmo arquivo atualiza o cadastro da calculadora (NCM, classificação fiscal, preço de venda)
  let cadastro = 0;
  if (col('CODCLASSFISCAL') >= 0 && col('PRODUTO') >= 0) { try { cadastro = M.importarProdutosCSV(texto); } catch {} }
  return { total: Object.keys(out).length, comCusto, cadastro };
}

// Custos embutidos no app, criptografados (AES-GCM + PBKDF2). Só abrem com a senha.
export const temCustosEmbutidos = () => !!CUSTOS_ENC?.data;
export async function desbloquearCustos(senha) {
  const de64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const enc = new TextEncoder();
  const k0 = await crypto.subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: de64(CUSTOS_ENC.salt), iterations: CUSTOS_ENC.iter, hash: 'SHA-256' }, k0, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  let plano;
  try { plano = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: de64(CUSTOS_ENC.iv) }, key, de64(CUSTOS_ENC.data)); }
  catch { throw new Error('Senha errada'); }
  const d = JSON.parse(new TextDecoder().decode(plano));
  const out = {};
  for (const [cod, [custo, venda, minimo, descMax, estoque, marca]] of Object.entries(d.custos)) {
    out[cod] = { custo: custo > 0 ? custo : null, venda: venda || null, minimo: minimo || null, descMax: descMax || null, estoque, marca, desc: M.PRODUCT_REGISTRY[cod]?.desc || '' };
  }
  gravar('custos', out);
  const comCusto = Object.values(out).filter(c => c.custo > 0).length;
  gravar('custosInfo', { quando: d.quando, arquivo: d.arquivo + ' (embutido no app)', total: Object.keys(out).length, comCusto });
  return { total: Object.keys(out).length, comCusto };
}
export const bloquearCustos = () => { try { localStorage.removeItem(LS + 'custos'); localStorage.removeItem(LS + 'custosInfo'); } catch {} };

// ---------- Redes ----------
const novaId = () => 'r' + Date.now().toString(36);
export function redes() {
  let r = ler('lista', null);
  if (!r) { r = [{ id: 'sander', nome: SANDER.nome, uf: SANDER.uf, contribuinte: true, regimeCliente: 'SN', margemAlvo: 30, custosVar: {}, arred: '90', itens: SANDER.itens.map(i => ({ ...i, preco: null })), lojas: SANDER.lojas, criada: new Date().toISOString() }]; gravar('lista', r); }
  return r;
}
export const rede = (id) => redes().find(r => r.id === id);
export function salvarRede(rd) { const l = redes(); const i = l.findIndex(x => x.id === rd.id); if (i >= 0) l[i] = rd; else l.push(rd); gravar('lista', l); return rd; }
export function excluirRede(id) { gravar('lista', redes().filter(r => r.id !== id)); }
export function criarRede(nome, uf) { return salvarRede({ id: novaId(), nome, uf, contribuinte: true, regimeCliente: 'SN', margemAlvo: 30, custosVar: {}, arred: '90', itens: [], lojas: [], criada: new Date().toISOString() }); }

export function importarLojasCSV(texto) {
  const { header, rows } = M.parseCSV(texto);
  const col = (...n) => M.findCol(header, n);
  const ix = { cod: col('CODCLIENTE', 'COD', 'Código', 'Codigo', 'cod'), razao: col('RAZAOSOCIAL', 'RAZAO', 'Razão Social', 'NOME', 'Cliente'), cnpj: col('CNPJ', 'CNPJ_CPF', 'CPFCNPJ'), cidade: col('CIDADE', 'Cidade', 'MUNICIPIO'), uf: col('UF', 'ESTADO') };
  if (ix.razao < 0) throw new Error('Não achei a coluna do nome do cliente (RAZAOSOCIAL, NOME ou Cliente).');
  return rows.filter(r => (r[ix.razao] || '').trim()).map(r => ({ cod: ix.cod >= 0 ? r[ix.cod].trim() : '', razao: r[ix.razao].trim(), cnpj: ix.cnpj >= 0 ? (r[ix.cnpj] || '').trim() : '', cidade: ix.cidade >= 0 ? (r[ix.cidade] || '').trim() : '', uf: ix.uf >= 0 ? (r[ix.uf] || '').trim().toUpperCase() : '' }));
}

// ---------- Produto: cadastro + custo + fiscal ----------
export function infoProduto(cod) {
  const p = M.PRODUCT_REGISTRY[cod] || null;
  const c = custos()[cod] || null;
  const fiscal = p && M.NCM_CATALOG[p.classfiscal] ? M.NCM_CATALOG[p.classfiscal] : null;
  return {
    cod, cadastro: p, fiscal, custo: c?.custo ?? null,
    precoTabela: c?.venda ?? p?.preco ?? null, minimo: c?.minimo ?? null, descMax: c?.descMax ?? null, estoque: c?.estoque ?? null,
    descricao: p?.desc || c?.desc || '', importado: fiscal ? M.guessImportado(fiscal.descricao) : false
  };
}

// ICMS próprio da Freedom na venda (fração)
export function icmsProprio(destino, importado, origem = config.get().uf) {
  if (origem === destino) return params().icmsInterno / 100;
  return (M.aliqInterestadual(importado, origem, destino) || 12) / 100;
}

// Margem líquida = (preço − ICMS próprio − custos variáveis − custo) ÷ preço
// var = fração total dos custos variáveis (comissão, frete, PIS/COFINS...)
export function calcMargem({ preco, custo, icms, var: v }) {
  if (!(preco > 0)) return { margem: NaN, lucro: NaN, icmsValor: NaN, varValor: NaN };
  const icmsValor = preco * icms, varValor = preco * v;
  const lucro = preco - icmsValor - varValor - (custo || 0);
  return { margem: custo > 0 ? lucro / preco : NaN, lucro: custo > 0 ? lucro : NaN, icmsValor, varValor, markup: custo > 0 ? preco / custo - 1 : NaN };
}

// Preço que dá a margem alvo (fração)
export function precoParaMargem({ custo, icms, var: v, alvo, arred = 'none' }) {
  const div = 1 - icms - v - alvo;
  if (!(custo > 0) || div <= 0) return NaN;
  return arredondar(custo / div, arred);
}
export function arredondar(v, modo) {
  if (!(v > 0)) return v;
  if (modo === '90') { const base = Math.floor(v); const c = base + 0.9; return c >= v ? +c.toFixed(2) : +(base + 1.9).toFixed(2); }
  if (modo === '99') { const base = Math.floor(v); const c = base + 0.99; return c >= v ? +c.toFixed(2) : +(base + 1.99).toFixed(2); }
  if (modo === 'inteiro') return Math.ceil(v);
  return Math.round(v * 100) / 100;
}

// Estados com filial da Freedom: orçamento sai livre de ICMS-ST e DIFAL (faturado de dentro do estado)
export const FILIAIS_ORC = ['PR', 'SP', 'RS', 'SC', 'RJ'];
export const ehFilial = (uf) => FILIAIS_ORC.includes(uf);

// Linha completa de um item da rede: preço, margem, ST
export function linhaItem(rd, it, destino = rd.uf) {
  const info = infoProduto(it.cod);
  const preco = it.preco ?? info.precoTabela;
  const icms = icmsProprio(destino, info.importado);
  const v = totalCustosVar(rd);
  const m = calcMargem({ preco, custo: info.custo, icms, var: v });
  let st = 0, fcp = 0, difal = 0, stStatus = info.fiscal ? '' : 'sem fiscal', calc = null;
  if (ehFilial(destino)) {
    stStatus = 'filial';
  } else if (rd.contribuinte === false) {
    // Consumidor final: DIFAL = preço × (alíquota interna do destino − interestadual)
    const intra = (M.ALIQUOTAS_UF[destino]?.aliq || 0) / 100;
    difal = preco > 0 ? Math.max(0, preco * (intra - icms)) : 0;
    stStatus = 'difal';
  } else if (info.fiscal && preco > 0) {
    const cat = categoriaPorNcm(info.fiscal.ncm);
    if (cat && cat.cest) {
      // Cabos, carregadores e fones: MVA conferida no Tributei (ficha revisada / Simulação rápida)
      const r = calcularSt({ ncm: info.fiscal.ncm, origem: config.get().uf, destino, importado: info.importado, valores: { vProd: preco } });
      st = r.temSt ? r.st : 0; stStatus = r.temSt ? 'Sim' : 'Nao'; calc = { conferido: true, ...r };
    } else {
      calc = M.fullCalc(info.fiscal, info.importado, config.get().uf, destino, 1, preco, rd.regimeCliente, { regimeRemetente: 'RN' });
      st = calc.icmsSTResult ? calc.icmsSTResult.icmsST : 0;
      fcp = calc.fcpResult?.temFCP ? calc.fcpResult.valor : 0;
      stStatus = calc.stIndefinido ? 'sem MVA' : calc.stStatus;
    }
  }
  return { it, info, preco, icms, var: v, ...m, st, fcp, difal, stStatus, calc, filial: ehFilial(destino), impostoCliente: st + fcp + difal, finalComSt: (preco || 0) + st + fcp + difal, abaixoMinimo: info.minimo && preco < info.minimo };
}

// ---------- Orçamentos salvos ----------
export const orcamentos = () => ler('orcamentos', []);
export const salvarOrcamento = (o) => gravar('orcamentos', [o, ...orcamentos().filter(x => x.numero !== o.numero)].slice(0, 60));
