// Cálculo de ICMS-ST feito pelo próprio app (sem depender da API).
// Usa a tabela de MVA original da ficha revisada (22/10/2026) e as alíquotas internas.
import { ALIQ_INTERNA, CATEGORIAS, categoriaPorNcm } from './data.js';

// MVA original por UF (cabos, carregadores, fones). null = sem ST pelo fornecedor.
const MVA_TXT = 'AC:.36,,|AP:.36,.58,.42|DF:.36,,|MT:.6328,.5386,.5386|MG:.40,.40,.45|PB:.36,,|PR:.36,.43,.57|RJ:.41,.2936,.5824|SP:.42,.78,.41';
export const MVA_ORIGINAL = Object.fromEntries(MVA_TXT.split('|').map(l => {
  const [uf, v] = l.split(':'); const [a, b, c] = v.split(',').map(x => x === '' ? null : Number(x));
  return [uf, { cabos: a, carregadores: b, fones: c, suportes: null }];
}));

// UFs que aplicam a MVA da tabela direto, sem a fórmula de ajuste (MT: Portaria SEFAZ 195)
export const SEM_AJUSTE = ['MT'];

const SUL_SUDESTE = ['PR', 'SC', 'RS', 'SP', 'RJ', 'MG']; // ES fica de fora (recebe 7%)

// Alíquota interestadual: 4% importado; 7% de S/SE (menos ES) para N/NE/CO/ES; 12% nos demais casos
export function aliqInterestadual(origem, destino, importado) {
  if (origem === destino) return ALIQ_INTERNA[destino];
  if (importado) return 0.04;
  if (SUL_SUDESTE.includes(origem) && !SUL_SUDESTE.includes(destino)) return 0.07;
  return 0.12;
}

export function mvaAjustada(mvaOriginal, aliqInter, aliqIntra, uf) {
  if (SEM_AJUSTE.includes(uf) || aliqInter >= aliqIntra) return mvaOriginal;
  return (1 + mvaOriginal) * (1 - aliqInter) / (1 - aliqIntra) - 1;
}

// Calcula o ST de um item. valores: { vProd, vFrete, vSeg, IPI, cOutro, vDescIC }
export function calcularSt({ ncm, origem, destino, importado, valores, mvaOriginal }) {
  const cat = categoriaPorNcm(ncm);
  const mvaO = mvaOriginal ?? (cat ? MVA_ORIGINAL[destino]?.[cat.id] ?? null : null);
  const inter = aliqInterestadual(origem, destino, importado);
  const intra = ALIQ_INTERNA[destino];
  const v = { vProd: 0, vFrete: 0, vSeg: 0, IPI: 0, cOutro: 0, vDescIC: 0, ...valores };
  const baseProprio = v.vProd + v.vFrete + v.vSeg + v.cOutro - v.vDescIC;
  const icmsProprio = baseProprio * inter;
  if (mvaO === null || mvaO === undefined) {
    return { temSt: false, cat, inter, intra, icmsProprio, memoria: [`Sem ST para ${cat ? cat.nome : 'este NCM'} em ${destino} na tabela do app.`] };
  }
  const mvaA = mvaAjustada(mvaO, inter, intra, destino);
  const baseSt = (baseProprio + v.IPI) * (1 + mvaA);
  const st = Math.max(0, baseSt * intra - icmsProprio);
  const f = (x) => x.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const p = (x) => (x * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%';
  return {
    temSt: true, cat, mvaOriginal: mvaO, mvaAjustada: mvaA, inter, intra, baseProprio, icmsProprio, baseSt, st,
    memoria: [
      `Base própria = produtos ${f(v.vProd)}${v.vFrete ? ' + frete ' + f(v.vFrete) : ''}${v.vSeg ? ' + seguro ' + f(v.vSeg) : ''}${v.cOutro ? ' + outras ' + f(v.cOutro) : ''}${v.vDescIC ? ' − desconto ' + f(v.vDescIC) : ''} = ${f(baseProprio)}`,
      `ICMS próprio = ${f(baseProprio)} × ${p(inter)} = ${f(icmsProprio)}`,
      SEM_AJUSTE.includes(destino) || inter >= intra
        ? `MVA = ${p(mvaO)} (${destino} aplica sem ajuste)`
        : `MVA ajustada = (1 + ${p(mvaO)}) × (1 − ${p(inter)}) ÷ (1 − ${p(intra)}) − 1 = ${p(mvaA)}`,
      `Base ST = (${f(baseProprio)}${v.IPI ? ' + IPI ' + f(v.IPI) : ''}) × (1 + ${p(mvaA)}) = ${f(baseSt)}`,
      `ICMS-ST = ${f(baseSt)} × ${p(intra)} − ${f(icmsProprio)} = ${f(st)}`
    ]
  };
}

export { CATEGORIAS };
