// Confirma no Tributei (Simulação rápida) o que o motor da calculadora calculou.
import { api } from '../api.js';
import { chave, config } from '../store.js';
import { tem } from '../acessos.js';
import { fmtNcm, fmtCest } from '../data.js';
import { linhasSimulacao, temStFornecedor } from '../extrair.js';
import { registrarTributei } from './motor-st.js';

export async function tributeiDisponivel() {
  return !!(await chave.ler()) && tem('simulacao') !== false;
}

// Uma consulta. Retorna valores absolutos para a quantidade/valor enviados.
export async function consultar({ item, importado, origem, destino, qtd, valorUnit, regimeCliente, regimeRemetente, contribuinte = true }) {
  const corpo = {
    tipoOperacao: 'venda', tipoCalculo: contribuinte ? 'icmsst' : 'difal',
    destinatario_simples: regimeCliente === 'SN' ? '1' : '2', simples: regimeRemetente === 'SN' ? '1' : '2',
    estado_emit: [origem], estado_dest: [destino], importado: !!importado,
    ncm: fmtNcm(item.ncm), cest: fmtCest(item.cest || ''),
    quantidade: Math.max(1, Math.round(qtd) || 1), vUnit: +(valorUnit * (qtd / (Math.max(1, Math.round(qtd) || 1)))).toFixed(4)
  };
  if (destino === 'MT' || origem === 'MT') corpo.cliente_atuacao = config.get().regraMT;
  const r = await api.simulacao(corpo);
  const l = linhasSimulacao(r).find(x => x.uf === destino) || linhasSimulacao(r)[0];
  if (!l) return { ok: false, bruto: r, erro: 'Resposta sem os campos esperados' };
  const temSt = contribuinte ? temStFornecedor(l) : false;
  const res = {
    ok: true, bruto: r, corpo, contribuinte,
    temSt, quem: l.quem, protocolo: l.protocolo,
    mvaAplicada: isNaN(l.mva) ? null : l.mva * 100, aliqInterna: isNaN(l.aliqInterna) ? null : l.aliqInterna * 100, aliqInter: isNaN(l.aliqInter) ? null : l.aliqInter * 100,
    baseSt: isNaN(l.base) ? null : l.base,
    st: temSt ? (l.valorSt || 0) : 0, fcp: temSt ? (l.valorFcp || 0) : 0, difal: contribuinte ? 0 : (l.difal || 0)
  };
  if (temSt && res.mvaAplicada > 0) {
    registrarTributei({ ncm: item.ncm, uf: destino, importado, regimeRemetente, mvaAplicada: res.mvaAplicada, aliqInter: res.aliqInter ?? (importado ? 4 : 12), aliqIntra: res.aliqInterna ?? 18, internalOp: origem === destino });
  }
  return res;
}

// Pedido: uma consulta por NCM/CEST/origem do produto (com R$ 100) e aplica o percentual em cada linha.
export async function confirmarPedido(linhasCalc, { origem, destino, regimeCliente, regimeRemetente, contribuinte }, aoProgresso = () => {}) {
  const grupos = new Map();
  for (const l of linhasCalc) {
    if (!l.r) continue;
    const k = `${l.r.item.ncm}|${l.r.item.cest || ''}|${l.importado ? 1 : 0}`;
    if (!grupos.has(k)) grupos.set(k, { item: l.r.item, importado: l.importado, linhas: [] });
    grupos.get(k).linhas.push(l);
  }
  let i = 0;
  for (const g of grupos.values()) {
    aoProgresso(++i, grupos.size);
    try {
      const t = await consultar({ item: g.item, importado: g.importado, origem, destino, qtd: 1, valorUnit: 100, regimeCliente, regimeRemetente, contribuinte });
      for (const l of g.linhas) {
        const f = l.r.valorMerc / 100;
        l.trib = t.ok ? { ...t, st: t.st * f, fcp: t.fcp * f, difal: t.difal * f, baseSt: t.baseSt != null ? t.baseSt * f : null } : { ok: false, erro: t.erro };
      }
    } catch (e) {
      for (const l of g.linhas) l.trib = { ok: false, erro: e.message };
    }
  }
  return grupos.size;
}
