// Motor da antiga "Calculadora de ICMS-ST | Grupo Freedom" (consulta_ncm_com_pdf.html),
// trazido para o app. A lógica de cálculo é a mesma; as mudanças são:
//  - a base (NCMs, produtos e MVAs aprendidas) fica salva no aparelho, não só na aba;
//  - entra uma nova fonte de MVA, a mais confiável: a confirmada pelo Tributei.
import BASE from './base-fiscal.json';

const LS = 'ffiscal.motor.';
const ler = (k, p) => { try { const v = localStorage.getItem(LS + k); return v ? JSON.parse(v) : p; } catch { return p; } };
const gravar = (k, v) => { try { localStorage.setItem(LS + k, JSON.stringify(v)); return true; } catch { return false; } };

export let NCM_CATALOG = ler('ncm', null) || BASE.NCM_CATALOG;
export let PRODUCT_REGISTRY = ler('produtos', null) || BASE.PRODUCT_REGISTRY;
export const { ESTADOS, ST_MATRIX, ALIQUOTAS_UF, ANTECIPACAO_UF, FCP_TABLE, MVA } = BASE;
export const MVA_APRENDIDA = ler('mvaAprendida', {});   // "ncm|uf" -> MVA original (%) deduzida de pedido
export const MVA_TRIBUTEI = ler('mvaTributei', {});     // "ncm|uf|imp|regRem" -> { mva, quando } confirmada pelo Tributei

export const GRUPO_A = ['MG', 'PR', 'RJ', 'RS', 'SC', 'SP'];
export const GRUPO_B = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'PA', 'PB', 'PE', 'PI', 'RN', 'RO', 'RR', 'SE', 'TO'];
const SEGMENTOS_SUPERFLUOS = ['02', '03', '04', '20', '25'];

export function salvarCatalogo(novo) { NCM_CATALOG = novo; return gravar('ncm', novo); }
export function salvarProdutos(novo) { PRODUCT_REGISTRY = novo; return gravar('produtos', novo); }
export function restaurarBase() { NCM_CATALOG = BASE.NCM_CATALOG; PRODUCT_REGISTRY = BASE.PRODUCT_REGISTRY; try { localStorage.removeItem(LS + 'ncm'); localStorage.removeItem(LS + 'produtos'); } catch {} }
export const baseAlterada = () => !!(ler('ncm', null) || ler('produtos', null));

export function normalize(s) { return (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
export function ncmKey(s) { return String(s || '').replace(/\D/g, ''); }
export function flagSN(v) { const n = normalize(v).trim(); if (n === 'sim') return 'Sim'; if (n === 'nao') return 'Nao'; return 'Verificar'; }
export const catalogList = () => Object.values(NCM_CATALOG);

// Aceita "1.234,56", "1234.56", '"1.234,56"', "R$ 12,50" e "12,5000"
export function toNum(s) {
  if (s === null || s === undefined) return NaN;
  if (typeof s === 'number') return isFinite(s) ? s : NaN;
  s = String(s).trim().replace(/^"+|"+$/g, '').replace(/R\$/gi, '').replace(/\s/g, '');
  if (!s) return NaN;
  const v = s.indexOf(',') >= 0, p = s.indexOf('.') >= 0;
  if (v && p) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (v) s = s.replace(',', '.');
  else if (p) { const x = s.split('.'); if (x.length > 2 || (x[1] && x[1].length === 3)) s = s.replace(/\./g, ''); }
  const n = parseFloat(s);
  return isFinite(n) ? n : NaN;
}

// "(IMP)", "(IMPORTADO)", "(ST-IMP)" -> importado (4%)
export function guessImportado(desc) {
  const d = normalize(desc);
  const m = d.match(/\(([^)]*)\)/);
  if (m) { const g = m[1].trim(); if (/^imp/.test(g) || /st-\s*imp/.test(g)) return true; if (/^nac/.test(g) || /st-\s*nac/.test(g)) return false; }
  if (/\bnacional\b/.test(d)) return false;
  return /importad/.test(d);
}

function isSuperfluo(item) {
  const e = ST_MATRIX[item.ncm];
  if (e && e.segmento && e.segmento.split(',').map(s => s.trim()).some(s => SEGMENTOS_SUPERFLUOS.includes(s))) return true;
  const ch = (item.ncm || '').slice(0, 2);
  if (['33', '24', '71'].includes(ch)) return true;
  const d = normalize(item.descricao);
  if (ch === '22' && /(alcool|vodka|whisky|gin|genebra|cerveja|vinho|licor)/.test(d)) return true;
  if (ch === '87' && /(automovel|veiculo)/.test(d)) return true;
  return false;
}

export function computeFCP(uf, item, baseCalculo) {
  const t = FCP_TABLE[uf]; const info = ALIQUOTAS_UF[uf] || {};
  if (!t || !t.temFCP) return { temFCP: false, pct: 0, valor: 0, motivo: 'Este estado não cobra FCP.' };
  if (!baseCalculo || baseCalculo <= 0) return { temFCP: false, pct: 0, valor: 0, motivo: 'Sem base de cálculo para o FCP.' };
  const d = normalize(item.descricao);
  let pct = 0, motivo = '';
  if (uf === 'AM') {
    if (/(refrigerante|isotonico|energetico)/.test(d)) { pct = t.lista; motivo = `FCP de ${t.lista}% no AM para refrigerantes/isotônicos/energéticos.`; }
    else return { temFCP: false, pct: 0, valor: 0, motivo: 'No AM o FCP só incide sobre refrigerantes/isotônicos/energéticos.' };
  } else {
    const sup = isSuperfluo(item);
    if (t.geralQuaseTodos) { pct += t.geral; motivo = `FCP geral de ${t.geral}% (quase todos os produtos)`; if (sup && t.lista) { pct += t.lista; motivo += ` + ${t.lista}% por categoria sujeita a FCP.`; } else motivo += '.'; }
    else if (sup && t.lista) { pct = t.lista; motivo = `Item na categoria sujeita a FCP neste estado (${info.fcpAplica || 'lista específica'}): ${t.lista}%.`; }
    else return { temFCP: false, pct: 0, valor: 0, motivo: 'Item fora da lista de FCP deste estado (confirme com o fiscal).' };
  }
  if (pct <= 0) return { temFCP: false, pct: 0, valor: 0, motivo: 'Este estado não cobra FCP para este item.' };
  return { temFCP: true, pct, valor: baseCalculo * (pct / 100), motivo };
}

// ---------------------------------------------------------------------------
// MVA automática. Ordem de confiança:
//  0. tributei    - confirmada pelo Tributei (nova)
//  1. aprendida   - deduzida de um pedido real do sistema
//  2. oficial     - publicada para o NCM no estado
//  3. segmento-uf - mediana do segmento CEST no estado
//  4. referência  - mediana dos estados conhecidos
// ---------------------------------------------------------------------------
const chaveTrib = (ncm, uf, imp, regRem) => `${ncmKey(ncm)}|${uf}|${imp ? 'I' : 'N'}|${regRem || 'RN'}`;

export function resolverMVA(ncm, uf, ctx = {}) {
  const k = ncmKey(ncm);
  const t = MVA_TRIBUTEI[chaveTrib(ncm, uf, ctx.importado, ctx.regimeRemetente)];
  if (t && t.mvaOriginal > 0) return { mva: t.mvaOriginal, fonte: 'tributei', rotulo: 'confirmada no Tributei' };
  const ap = MVA_APRENDIDA[k + '|' + uf];
  if (ap > 0) return { mva: ap, fonte: 'aprendida', rotulo: 'aprendida de pedido' };
  const of = MVA.oficial[k];
  if (of && of[uf] > 0) return { mva: of[uf], fonte: 'oficial', rotulo: 'tabela oficial ' + uf };
  const seg = MVA.segDoNcm[k];
  if (seg && MVA.segUF[seg] && MVA.segUF[seg][uf] > 0) return { mva: MVA.segUF[seg][uf], fonte: 'segmento-uf', rotulo: `estimada (segmento ${seg} em ${uf})` };
  if (MVA.ncmRef[k] > 0) return { mva: MVA.ncmRef[k], fonte: 'referencia', rotulo: 'estimada (referência do NCM)' };
  if (seg && MVA.segRef[seg] > 0) return { mva: MVA.segRef[seg], fonte: 'referencia', rotulo: `estimada (referência do segmento ${seg})` };
  return { mva: null, fonte: 'ausente', rotulo: 'sem MVA' };
}
export const mvaConfiavel = (fonte) => ['tributei', 'sistema', 'aprendida', 'oficial', 'manual'].includes(fonte);

// Guarda a MVA original a partir da MVA aplicada (desfaz o ajuste interestadual)
function mvaOriginalDe(mvaAplicada, aliqInter, aliqIntra, internalOp, regimeRemetente, semAjuste) {
  if (internalOp || regimeRemetente === 'SN' || semAjuste || !(aliqIntra < 100)) return mvaAplicada;
  return ((1 + mvaAplicada / 100) * (1 - aliqIntra / 100) / (1 - aliqInter / 100) - 1) * 100;
}

export function aprenderMVA(ncm, uf, mvaAplicada, aliqInter, aliqIntra, internalOp, regimeRemetente) {
  if (!(mvaAplicada > 0)) return;
  const orig = mvaOriginalDe(mvaAplicada, aliqInter, aliqIntra, internalOp, regimeRemetente, false);
  if (orig > 0 && orig < 1000) { MVA_APRENDIDA[ncmKey(ncm) + '|' + uf] = orig; gravar('mvaAprendida', MVA_APRENDIDA); }
}

// MT aplica a MVA da Portaria 195 sem ajuste (como o Tributei faz)
export const UF_SEM_AJUSTE = ['MT'];

export function registrarTributei({ ncm, uf, importado, regimeRemetente, mvaAplicada, aliqInter, aliqIntra, internalOp }) {
  if (!(mvaAplicada > 0)) return;
  const orig = mvaOriginalDe(mvaAplicada, aliqInter, aliqIntra, internalOp, regimeRemetente, UF_SEM_AJUSTE.includes(uf));
  MVA_TRIBUTEI[chaveTrib(ncm, uf, importado, regimeRemetente)] = { mvaOriginal: orig, mvaAplicada, quando: new Date().toISOString() };
  gravar('mvaTributei', MVA_TRIBUTEI);
}
export function limparAprendidas() { for (const k of Object.keys(MVA_APRENDIDA)) delete MVA_APRENDIDA[k]; for (const k of Object.keys(MVA_TRIBUTEI)) delete MVA_TRIBUTEI[k]; gravar('mvaAprendida', {}); gravar('mvaTributei', {}); }

// Resoluções do Senado 22/89 e 13/2012
export function aliqInterestadual(importado, origem, destino) {
  if (origem === destino) return null;
  if (importado) return 4;
  if (GRUPO_A.includes(origem) && GRUPO_B.includes(destino)) return 7;
  return 12;
}

export function aliqInternaSugerida(item, destino) {
  const geral = ALIQUOTAS_UF[destino] ? ALIQUOTAS_UF[destino].aliq : 0;
  return Math.max(geral, item.icms || 0) || null;
}

export function calcICMSST(item, importado, origem, destino, valorMerc, aliqInterna, mvaOriginal, mvaJaAjustada, regimeRemetente) {
  const internalOp = origem === destino;
  if (!aliqInterna || aliqInterna <= 0 || aliqInterna >= 100) return null;
  if (mvaOriginal == null || isNaN(mvaOriginal) || mvaOriginal <= 0) return null;
  if (!valorMerc || valorMerc <= 0) return null;
  const alqInter = aliqInterestadual(importado, origem, destino);
  const remetenteSN = regimeRemetente === 'SN';
  const semAjuste = internalOp || mvaJaAjustada || remetenteSN || UF_SEM_AJUSTE.includes(destino);
  const mvaAplicada = semAjuste ? mvaOriginal : ((1 + mvaOriginal / 100) * (1 - alqInter / 100) / (1 - aliqInterna / 100) - 1) * 100;
  const baseST = valorMerc * (1 + mvaAplicada / 100);
  const icmsProprio = internalOp ? valorMerc * (aliqInterna / 100) : valorMerc * (alqInter / 100);
  let icmsST = baseST * (aliqInterna / 100) - icmsProprio;
  const negativo = icmsST < 0; if (icmsST < 0) icmsST = 0;
  return { internalOp, aliqInterna, mvaOriginal, mvaJaAjustada: !!mvaJaAjustada, regimeRemetente: regimeRemetente || null,
    mvaSemAjusteSN: remetenteSN && !internalOp && !mvaJaAjustada, alqInter, mvaAplicada, baseST, icmsProprio, icmsST, negativo, origem: 'calculado' };
}

// Quando o pedido já traz o ICMS-ST do sistema, reconstrói a base a partir dele
export function stAPartirDoSistema(importado, origem, destino, valorMerc, aliqInterna, icmsSTSistema) {
  if (!aliqInterna || aliqInterna <= 0 || !icmsSTSistema || icmsSTSistema <= 0 || !valorMerc || valorMerc <= 0) return null;
  const internalOp = origem === destino;
  const alqInter = aliqInterestadual(importado, origem, destino);
  const icmsProprio = internalOp ? valorMerc * (aliqInterna / 100) : valorMerc * (alqInter / 100);
  const baseST = (icmsSTSistema + icmsProprio) / (aliqInterna / 100);
  return { internalOp, aliqInterna, mvaOriginal: null, alqInter, mvaAplicada: (baseST / valorMerc - 1) * 100, baseST, icmsProprio, icmsST: icmsSTSistema, negativo: false, origem: 'sistema' };
}

export function calcAntecipacaoSemST(destino, regime, valorMerc, aliqInterna, origem, importado) {
  const e = ANTECIPACAO_UF[destino];
  if (!e) return { status: 'Verificar', devida: false, motivo: 'Não pesquisado para este estado.' };
  const flag = flagSN(regime === 'SN' ? e.sn : e.rn);
  const reg = regime === 'SN' ? 'Simples Nacional' : 'Regime Normal';
  if (flag === 'Nao') return { status: 'Nao', devida: false, motivo: `Este estado não exige antecipação de ICMS para produtos sem ST (${reg}).` };
  if (flag !== 'Sim' || !aliqInterna) return { status: 'Verificar', devida: false, motivo: `Antecipação ainda não pesquisada para ${reg}. ${e.efeito || ''}` };
  const alqInter = importado ? 4 : ((GRUPO_A.includes(origem) && GRUPO_B.includes(destino)) ? 7 : 12);
  const dif = aliqInterna - alqInter;
  const valor = dif > 0 ? valorMerc * (dif / 100) : 0;
  return { status: 'Sim', devida: valor > 0, valor, alqInter, diferenca: dif, base: e.base || '', motivo: `${e.efeito} (${reg}).` };
}

// opts: { mva, mvaJaAjustada, aliqInterna, icmsSTSistema, regimeRemetente }
export function fullCalc(item, importado, origem, destino, qtd, valorUnit, regime, opts = {}) {
  const valorMerc = qtd * valorUnit;
  const internalOp = origem === destino;
  const aliqInterna = opts.aliqInterna || aliqInternaSugerida(item, destino);
  const alqInter = aliqInterestadual(importado, origem, destino);
  const icmsProprioOperacao = internalOp ? valorMerc * ((aliqInterna || 0) / 100) : valorMerc * ((alqInter || 0) / 100);
  const stEntry = ST_MATRIX[ncmKey(item.ncm)];
  let stStatus, stInfo = null;
  if (!item.cest) stStatus = 'SemCEST';
  else if (stEntry) { stInfo = stEntry; stStatus = flagSN(stEntry.st[destino]); }
  else stStatus = 'Verificar';
  const stDoSistema = opts.icmsSTSistema > 0;
  const temST = stDoSistema || stStatus === 'Sim' || stStatus === 'Verificar';
  let icmsSTResult = null, stIndefinido = false, mvaInfo = null;
  if (temST) {
    if (stDoSistema) {
      icmsSTResult = stAPartirDoSistema(importado, origem, destino, valorMerc, aliqInterna, opts.icmsSTSistema);
      if (icmsSTResult) { mvaInfo = { fonte: 'sistema', rotulo: 'calculada pelo sistema' }; aprenderMVA(item.ncm, destino, icmsSTResult.mvaAplicada, icmsSTResult.alqInter, aliqInterna, icmsSTResult.internalOp, opts.regimeRemetente); }
      else stIndefinido = true;
    } else {
      let mvaUsar = opts.mva, jaAjustada = opts.mvaJaAjustada;
      if (!(mvaUsar > 0)) { mvaInfo = resolverMVA(item.ncm, destino, { importado, regimeRemetente: opts.regimeRemetente }); mvaUsar = mvaInfo.mva; jaAjustada = false; }
      else mvaInfo = { fonte: 'manual', rotulo: 'informada por você' };
      icmsSTResult = calcICMSST(item, importado, origem, destino, valorMerc, aliqInterna, mvaUsar, jaAjustada, opts.regimeRemetente);
      if (!icmsSTResult) stIndefinido = true;
    }
  }
  let antecipacaoResult = null;
  if ((stStatus === 'Nao' || stStatus === 'SemCEST') && !internalOp) antecipacaoResult = calcAntecipacaoSemST(destino, regime, valorMerc, aliqInterna, origem, importado);
  const fcpResult = icmsSTResult ? computeFCP(destino, item, icmsSTResult.baseST) : null;
  const icmsSTValor = icmsSTResult ? icmsSTResult.icmsST : 0;
  const fcpValor = fcpResult?.temFCP ? fcpResult.valor : 0;
  const antecipValor = antecipacaoResult?.devida ? antecipacaoResult.valor : 0;
  return { item, valorMerc, _qtd: qtd, internalOp, aliqInterna, alqInter, icmsProprioOperacao,
    stStatus, stInfo, stIndefinido, mvaInfo, icmsSTResult, fcpResult, antecipacaoResult,
    totalNota: valorMerc + icmsSTValor + fcpValor + antecipValor };
}

// ---------------------------------------------------------------------------
// Busca de produtos e classificações fiscais
// ---------------------------------------------------------------------------
export function buscar(query, maxProd = 30) {
  const raw = query.trim(); const q = normalize(raw);
  if (!q) return { produtos: [], total: 0, fiscais: [] };
  const qDig = raw.replace(/\D/g, ''); const termos = q.split(/\s+/).filter(Boolean);
  const produtos = [];
  for (const cod in PRODUCT_REGISTRY) {
    const p = PRODUCT_REGISTRY[cod]; const nd = normalize(p.desc), nc = normalize(cod);
    if (termos.every(t => nd.includes(t)) || nc === q || (q.length >= 3 && nc.includes(q))) produtos.push({ cod, p });
  }
  produtos.sort((a, b) => a.p.desc.localeCompare(b.p.desc, 'pt-BR'));
  const fiscais = catalogList().filter(i => (qDig.length >= 4 && i.ncm && i.ncm.includes(qDig)) || termos.every(t => normalize(i.descricao).includes(t))).slice(0, 25);
  return { produtos: produtos.slice(0, maxProd), total: produtos.length, fiscais };
}

// Acha a classificação fiscal de uma linha do pedido
export function resolverLinha(row) {
  if (row.classFiscal && NCM_CATALOG[row.classFiscal]) return { item: NCM_CATALOG[row.classFiscal], via: 'CODCLASSFISCAL' };
  const prod = PRODUCT_REGISTRY[String(row.codProduto || '').trim()];
  if (prod?.classfiscal && NCM_CATALOG[prod.classfiscal]) return { item: NCM_CATALOG[prod.classfiscal], via: 'cadastro de produtos', produto: prod };
  if (row.ean) {
    const m = Object.values(PRODUCT_REGISTRY).filter(p => String(p.ean || p.codigoBarras || '').replace(/\D/g, '') === row.ean);
    if (m.length === 1 && m[0].classfiscal && NCM_CATALOG[m[0].classfiscal]) return { item: NCM_CATALOG[m[0].classfiscal], via: 'código de barras', produto: m[0] };
  }
  const limpa = (s) => normalize(s).replace(/\b\d{8,14}\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const dp = limpa(row.descricao);
  if (dp.length >= 8) {
    const m = Object.values(PRODUCT_REGISTRY).filter(p => { const dc = limpa(p.desc); return dc && (dc === dp || dc.includes(dp) || dp.includes(dc)); });
    if (m.length === 1 && m[0].classfiscal && NCM_CATALOG[m[0].classfiscal]) return { item: NCM_CATALOG[m[0].classfiscal], via: 'descrição', produto: m[0] };
  }
  const nd = ncmKey(row.ncm);
  if (nd.length >= 8) { const c = catalogList().find(i => i.ncm === nd); if (c) return { item: c, via: 'NCM aproximado' }; }
  return null;
}

// ---------------------------------------------------------------------------
// Leitura de arquivos (CSV do sistema e PDF de orçamento/pedido)
// ---------------------------------------------------------------------------
export function decodificar(buf) {
  const b = new Uint8Array(buf);
  if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) return new TextDecoder('utf-8').decode(buf).replace(/^﻿/, '');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('iso-8859-1').decode(buf); }
}

export function parseCSV(text, sep) {
  if (!sep) { const l1 = text.split('\n')[0] || ''; sep = (l1.split(';').length >= l1.split(',').length) ? ';' : ','; }
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); cur = ''; rows.push(row); row = []; }
    else if (c !== '\r') cur += c;
  }
  row.push(cur); rows.push(row);
  const ok = rows.filter(r => r.some(x => x.trim() !== ''));
  if (!ok.length) return { header: [], rows: [] };
  return { header: ok[0].map(h => h.trim().replace(/^﻿/, '')), rows: ok.slice(1) };
}
export const findCol = (header, cands) => { for (const c of cands) { const i = header.findIndex(h => h.trim().toLowerCase() === c.toLowerCase()); if (i >= 0) return i; } return -1; };

export function lerPedidoCSV(text) {
  const { header, rows } = parseCSV(text);
  const ix = {
    cod: findCol(header, ['Cód. Prod.', 'CODPRODUTO', 'Cod. Prod.']), desc: findCol(header, ['Produto', 'PRODUTO', 'DESCRICAO']),
    qtde: findCol(header, ['Qtde', 'QTDE']), preco: findCol(header, ['Pr. C/ Desc.', 'Preco_Unid', 'Preço', 'PRECOVENDA']),
    cf: findCol(header, ['CODCLASSFISCAL']), ncm: findCol(header, ['COD_NCM', 'NCM']), st: findCol(header, ['VALICMSSUBST'])
  };
  if (ix.cod < 0 || ix.qtde < 0 || ix.preco < 0) throw new Error('Não encontrei as colunas Cód. Prod., Qtde e Preço. Confira se é o export de Pedido do sistema.');
  return {
    temColunaST: ix.st >= 0,
    linhas: rows.filter(r => r.length > 1 && (r[ix.cod] || '').trim()).map(r => ({
      codProduto: r[ix.cod].trim(), descricao: ix.desc >= 0 ? (r[ix.desc] || '').trim() : '',
      qtde: toNum(r[ix.qtde]), preco: toNum(r[ix.preco]),
      classFiscal: ix.cf >= 0 ? (r[ix.cf] || '').trim() : '', ncm: ix.ncm >= 0 ? (r[ix.ncm] || '').trim() : '',
      icmsSTSistema: ix.st >= 0 ? (toNum(r[ix.st]) || 0) : 0
    }))
  };
}

// PDF de orçamento/pedido do Freedom Tech (precisa ter texto selecionável)
export async function lerPedidoPDF(buf) {
  const pdfjs = await import('pdfjs-dist');
  try { const w = await import('pdfjs-dist/build/pdf.worker.min.js?url'); pdfjs.GlobalWorkerOptions.workerSrc = w.default; } catch {}
  let pdf;
  try { pdf = await pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)), isEvalSupported: false }).promise; }
  catch { pdf = await pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)), disableWorker: true, isEvalSupported: false }).promise; }
  const lines = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n); const content = await page.getTextContent(); const grupos = [];
    content.items.filter(i => i.str && i.str.trim()).forEach(i => {
      const x = i.transform ? i.transform[4] : 0, y = i.transform ? i.transform[5] : 0;
      let g = grupos.find(g => Math.abs(g.y - y) <= 2.5); if (!g) { g = { y, parts: [] }; grupos.push(g); }
      g.parts.push({ x, text: i.str });
    });
    grupos.sort((a, b) => b.y - a.y).forEach(g => { g.parts.sort((a, b) => a.x - b.x); lines.push({ page: n, x: Math.min(...g.parts.map(p => p.x)), text: g.parts.map(p => p.text).join(' ').replace(/\s+/g, ' ').trim() }); });
  }
  const inicio = (l) => { if (!l || l.x > 120) return false; const m = l.text.match(/^([^\s]+)\s+/); if (!m) return false; const t = m[1]; if (/^(codigo|código|descrição|descricao|total|produtos|freedom|atendente|vendedor)$/i.test(t)) return false; return /[A-Za-z]/.test(t) && /\d/.test(t); };
  const bloco = (b) => {
    if (!b.length) return null;
    const cm = b[0].text.match(/^([^\s]+)\s*(.*)$/); if (!cm) return null;
    const cod = cm[1].trim();
    const comb = [cm[2], ...b.slice(1).map(l => l.text)].join(' ').replace(/\s+/g, ' ').trim();
    const f = comb.match(/\bUN\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/i);
    if (!f) return { codProduto: cod, descricao: comb, qtde: NaN, preco: NaN, classFiscal: '', ncm: '', ean: '', icmsSTSistema: 0, erro: 'Não achei quantidade e valor no PDF' };
    const antes = comb.slice(0, f.index).trim(); const eans = antes.match(/\b\d{8,14}\b/g) || [];
    return { codProduto: cod, descricao: antes.replace(/\b\d{8,14}\b/g, '').replace(/\s+/g, ' ').trim(), qtde: toNum(f[1]), preco: toNum(f[2]), totalPDF: toNum(f[4]), ean: eans.length ? eans[eans.length - 1] : '', classFiscal: '', ncm: '', icmsSTSistema: 0 };
  };
  const rows = []; let dentro = false, atual = [], pag = null;
  const flush = () => { const r = bloco(atual); if (r) rows.push(r); atual = []; };
  for (const l of lines) {
    if (atual.length && pag !== null && l.page !== pag) flush();
    pag = l.page; const t = l.text.trim();
    if (/^PRODUTOS$/i.test(t)) { flush(); dentro = true; continue; }
    if (!dentro) continue;
    if (/^Total\s+Produtos\b|^Total\s+Or[çc]amento\b|^(CONDI[ÇC][ÕO]ES|OBSERVA[ÇC][ÕO]ES)$/i.test(t)) { flush(); dentro = false; continue; }
    if (/^(Código|Codigo)\b/i.test(t)) continue;
    if (inicio(l)) { flush(); atual = [l]; } else if (atual.length) atual.push(l);
  }
  flush();
  const ok = rows.filter(r => r.codProduto && (r.descricao || r.qtde > 0 || r.preco > 0));
  if (!ok.length) throw new Error('Nenhum produto identificado. O PDF pode ser imagem escaneada ou ter outro layout.');
  return { temColunaST: false, linhas: ok };
}

// Atualização da base a partir dos CSVs do sistema
export function importarCatalogoCSV(text) {
  const { header, rows } = parseCSV(text);
  const ix = { cod: findCol(header, ['CODCLASSFISCAL']), desc: findCol(header, ['DESCRICAO']), ncm: findCol(header, ['COD_NCM']), ipi: findCol(header, ['PERCIPI']), monof: findCol(header, ['MONOFPISCOFINS']), nac: findCol(header, ['PERCNAC']), imp: findCol(header, ['PERCIMP']), est: findCol(header, ['PERCEST']), cest: findCol(header, ['CEST']) };
  if (ix.cod < 0 || ix.ncm < 0) throw new Error('Não encontrei as colunas CODCLASSFISCAL e COD_NCM.');
  const novo = {};
  for (const r of rows) {
    const cod = (r[ix.cod] || '').trim(); const desc = ix.desc >= 0 ? (r[ix.desc] || '').trim() : '';
    if (!cod || !desc) continue;
    novo[cod] = { cod, descricao: desc, ncm: ncmKey(r[ix.ncm]), ipi: toNum(r[ix.ipi]) || 0, monofasico: ix.monof >= 0 && (r[ix.monof] || '').trim() === 'T', mva_nac: toNum(r[ix.nac]) || 0, mva_imp: toNum(r[ix.imp]) || 0, icms: toNum(r[ix.est]) || 0, cest: ix.cest >= 0 ? (r[ix.cest] || '').trim() : '' };
  }
  if (!Object.keys(novo).length) throw new Error('Nenhuma classificação válida no arquivo.');
  salvarCatalogo(novo); return Object.keys(novo).length;
}

export function importarProdutosCSV(text) {
  const { header, rows } = parseCSV(text);
  const ix = { cod: findCol(header, ['CODPRODUTO']), desc: findCol(header, ['PRODUTO']), ncm: findCol(header, ['COD_NCM']), cf: findCol(header, ['CODCLASSFISCAL']), sit: findCol(header, ['SITUACAO']), preco: findCol(header, ['PRECOVENDA']), ean: findCol(header, ['CODBARRAS', 'EAN', 'CODIGOBARRAS']) };
  if (ix.cod < 0) throw new Error('Não encontrei a coluna CODPRODUTO.');
  const novo = {};
  for (const r of rows) {
    const cod = (r[ix.cod] || '').trim(); if (!cod) continue;
    const rec = { desc: ix.desc >= 0 ? (r[ix.desc] || '').trim() : '', ncm: ix.ncm >= 0 ? ncmKey(r[ix.ncm]) : '', classfiscal: ix.cf >= 0 ? (r[ix.cf] || '').trim() : '', sit: ix.sit >= 0 ? (r[ix.sit] || '').trim() : '' };
    const pv = ix.preco >= 0 ? toNum(r[ix.preco]) : NaN; if (!isNaN(pv) && pv > 0) rec.preco = Math.round(pv * 100) / 100;
    if (ix.ean >= 0 && r[ix.ean]) rec.ean = ncmKey(r[ix.ean]);
    novo[cod] = rec;
  }
  if (!Object.keys(novo).length) throw new Error('Nenhum produto válido no arquivo.');
  salvarProdutos(novo); return Object.keys(novo).length;
}
