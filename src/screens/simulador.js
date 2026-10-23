// 1. Simulação de ICMS-ST por UF (lote) — alimenta a auditoria e a tabela de preços.
import { h, card, rotulo, chip, botao, aviso, carregando, mostrarErro, jsonBruto, tabela, exportarXlsx, carimbo, pctFmt, moeda, dataHora, campo, select, toast } from '../ui.js';
import { api } from '../api.js';
import { config, dados } from '../store.js';
import { UFS, CATEGORIAS, FILIAIS, soDigitos } from '../data.js';
import { linhasSimulacao, temStFornecedor } from '../extrair.js';
import { tem } from '../acessos.js';

const VALOR_BASE = 100; // simula R$ 100 e aplica o percentual em cada produto

export function corpoSimulacao(c, destinos, prods) {
  return {
    tipoOperacao: 'venda', tipoCalculo: 'icmsst',
    cliente_atuacao: c.regraMT, destinatario_simples: '2', simples: '2',
    estado_emit: [c.uf], estado_dest: destinos,
    produtos: prods.map(p => ({ ncm: p.ncm, cest: p.cest, importado: p.importado, quantidade: 1, vUnit: VALOR_BASE }))
  };
}

// Executa a simulação e devolve { porUf: { UF: { catId: resultado } }, brutos: [] }
export async function simular({ destinos, importado, categorias = CATEGORIAS, aoProgresso = () => {} }) {
  const c = config.get();
  const comCest = categorias.filter(k => k.cest);
  const prods = comCest.map(k => ({ ...k, importado }));
  const porUf = Object.fromEntries(destinos.map(uf => [uf, {}]));
  const brutos = [];

  const guardar = (linhas, catFixa) => {
    for (const l of linhas) {
      const cat = catFixa || comCest.find(k => soDigitos(k.ncm) === soDigitos(l.ncm)) || comCest.find(k => soDigitos(k.cest) === soDigitos(l.cest));
      if (!cat || !porUf[l.uf]) continue;
      const atual = porUf[l.uf][cat.id];
      const res = { mva: l.mva, aliqInterna: l.aliqInterna, aliqInter: l.aliqInter, pctSt: (l.valorSt || 0) / VALOR_BASE, pctFcp: (l.valorFcp || 0) / VALOR_BASE, quem: l.quem, protocolo: l.protocolo, temSt: temStFornecedor(l) };
      // se vierem várias regras para a mesma UF, fica a que gera ST pelo fornecedor
      if (!atual || (!atual.temSt && res.temSt)) porUf[l.uf][cat.id] = res;
    }
  };

  let identificou = false;
  if (tem('lote') !== false) try {
    aoProgresso('Enviando lote ao Tributei…');
    const r = await api.simulacaoLote(corpoSimulacao(c, destinos, prods));
    brutos.push({ tipo: 'lote', resposta: r });
    const linhas = linhasSimulacao(r);
    identificou = linhas.length && linhas.every(l => l.ncm || l.cest);
    if (identificou) guardar(linhas);
  } catch (e) {
    brutos.push({ tipo: 'lote', erro: e.message });
  }
  if (!identificou) {
    // Simulação rápida: uma chamada por NCM, já com todas as UFs de destino juntas
    for (const [i, p] of prods.entries()) {
      aoProgresso(`Consultando ${p.nome} (${i + 1}/${prods.length})…`);
      const corpo = corpoSimulacao(c, destinos, [p]);
      const { produtos, ...resto } = corpo;
      const r = await api.simulacao({ ...resto, ...produtos[0] });
      brutos.push({ tipo: p.nome, resposta: r });
      guardar(linhasSimulacao(r), p);
    }
  }
  // Produtos sem CEST (suportes): sem ST
  for (const k of categorias.filter(k => !k.cest)) for (const uf of destinos) porUf[uf][k.id] = { temSt: false, pctSt: 0, semCest: true };
  // Filiais vendem de dentro do estado: ST zerado
  for (const uf of destinos) if (FILIAIS.includes(uf)) for (const k of categorias) if (porUf[uf][k.id]) porUf[uf][k.id].filial = true;

  const sim = { quando: new Date().toISOString(), uf: c.uf, regraMT: c.regraMT, importado, porUf, brutos };
  dados.salvarSimulacao(sim);
  dados.registrar({ tipo: 'simulacao', quando: sim.quando, ufs: destinos.length });
  return sim;
}

export function celulaSt(r) {
  if (!r) return chip('sem retorno', 'mini');
  if (r.filial) return chip('filial', 'mini azul');
  if (r.semCest) return chip('sem CEST', 'mini');
  if (r.temSt) return h('span', {}, h('b', {}, pctFmt(r.pctSt)), h('div', { class: 'muted' }, 'MVA ' + pctFmt(r.mva)));
  if (/DESTINAT/.test(r.quem || '')) return chip('destinatário', 'mini atencao');
  return chip('sem ST', 'mini');
}

export default {
  id: 'simulador',
  titulo: 'Simulador de ICMS-ST',
  subtitulo: 'Todas as UFs de uma vez, pela API',
  resumo: 'MVA, ST e quem recolhe por estado para cabos, carregadores, fones e suportes',
  icone: 'calc', cor: 'rosa', largo: true,
  async render(el) {
    const c = config.get();
    const marcados = new Set(UFS.filter(u => u !== c.uf));
    const ufsBox = h('div', { class: 'ufs' });
    const desenharUfs = () => ufsBox.replaceChildren(...UFS.map(uf => h('label', { class: marcados.has(uf) ? 'on' : '', onclick: () => { marcados.has(uf) ? marcados.delete(uf) : marcados.add(uf); desenharUfs(); } }, uf)));
    desenharUfs();
    const inImp = h('input', { type: 'checkbox', checked: true });
    const inMT = select([['mva_original_two_b', 'Art. 2º-B · Demais'], ['mva_original_two_a', 'Art. 2º-A · Atacadista'], ['mva_original_one', 'Art. 1º · Simples']], c.regraMT);
    const saida = h('div');

    const rodar = async () => {
      config.set({ regraMT: inMT.value });
      const destinos = UFS.filter(u => marcados.has(u));
      if (!destinos.length) return toast('Escolha pelo menos uma UF', 'erro');
      const prog = carregando(); saida.replaceChildren(prog);
      try {
        const sim = await simular({ destinos, importado: inImp.checked, aoProgresso: (t) => (prog.lastChild.textContent = t) });
        mostrarResultado(saida, sim);
      } catch (e) { mostrarErro(saida, e); }
    };

    el.append(
      card(h('h2', {}, 'O que simular'),
        h('p', { class: 'desc' }, `Origem ${c.uf}, venda para revenda, cliente contribuinte. O Tributei calcula sobre R$ 100 e o app aplica o percentual em cada produto.`),
        h('div', { class: 'campos' },
          campo('Regra do MT', inMT),
          h('label', { class: 'check', style: { alignSelf: 'end', paddingBottom: '10px' } }, inImp, 'Produto importado (4%)')),
        rotulo('Estados de destino'),
        ufsBox,
        h('div', { class: 'acoes' },
          botao('Todos', () => { UFS.forEach(u => marcados.add(u)); desenharUfs(); }, 'secundario pequeno'),
          botao('Só sem filial', () => { marcados.clear(); UFS.filter(u => !FILIAIS.includes(u)).forEach(u => marcados.add(u)); desenharUfs(); }, 'secundario pequeno'),
          botao('Limpar', () => { marcados.clear(); desenharUfs(); }, 'secundario pequeno')),
        h('div', { class: 'acoes' }, botao('Simular no Tributei', rodar, 'primario cheio'))),
      saida);

    const ultima = dados.ultimaSimulacao();
    if (ultima) mostrarResultado(saida, ultima, true);
  }
};

function mostrarResultado(el, sim, antiga = false) {
  const ufs = Object.keys(sim.porUf);
  const comSt = ufs.filter(uf => CATEGORIAS.some(k => sim.porUf[uf][k.id]?.temSt && !sim.porUf[uf][k.id]?.filial));
  const semRetorno = ufs.filter(uf => CATEGORIAS.filter(k => k.cest).every(k => !sim.porUf[uf][k.id]));

  const exportar = () => exportarXlsx(`Simulacao-ST_${carimbo()}.xlsx`, [{
    nome: 'ST por UF',
    linhas: [['UF', ...CATEGORIAS.flatMap(k => [`${k.nome} · ST % do valor`, `${k.nome} · MVA`, `${k.nome} · quem recolhe`, `${k.nome} · protocolo`])],
      ...ufs.map(uf => [uf, ...CATEGORIAS.flatMap(k => { const r = sim.porUf[uf][k.id] || {}; return [r.temSt && !r.filial ? +(r.pctSt * 100).toFixed(2) : 0, isNaN(r.mva) || r.mva == null ? '' : +(r.mva * 100).toFixed(2), r.filial ? 'FILIAL' : (r.quem || (r.semCest ? 'SEM CEST' : '')), r.protocolo || ''] })])]
  }]);

  el.replaceChildren(
    card(h('div', { class: 'rotulo' }, antiga ? 'Última simulação' : 'Resultado'),
      h('div', { class: 'grande' }, `${comSt.length} UF${comSt.length === 1 ? '' : 's'} com ST`),
      h('div', { class: 'heroi' }, h('div', { class: 'linha' }, `${ufs.length} estados consultados · ${dataHora(new Date(sim.quando))} · ${sim.importado ? 'importado (4%)' : 'nacional'}`),
        h('div', { class: 'chips' }, comSt.map(uf => chip(uf, 'rosa')), semRetorno.length ? chip(`! ${semRetorno.length} sem retorno`, 'atencao') : null)),
      h('div', { class: 'acoes' }, botao('Exportar planilha', exportar, 'secundario'), botao('Ver tabela de preços', () => (location.hash = '#/precos'), 'secundario'), botao('Auditar sistema', () => (location.hash = '#/auditoria'), 'secundario'))),
    semRetorno.length && semRetorno.length === ufs.length ? aviso('O app não reconheceu o formato da resposta. Abra "Resposta completa" abaixo, copie e me envie para ajustar a leitura.', 'atencao') : null,
    card(h('h2', {}, 'ICMS-ST por estado'), h('p', { class: 'desc' }, 'Percentual de ST sobre o valor do produto (com a MVA). "destinatário" = o cliente recolhe, a Freedom não destaca.'),
      tabela([{ titulo: 'UF', valor: (uf) => h('b', {}, uf) }, ...CATEGORIAS.map(k => ({ titulo: k.nome, valor: (uf) => celulaSt(sim.porUf[uf][k.id]) }))], ufs, { classeLinha: (uf) => comSt.includes(uf) ? 'sel' : '' })),
    card(h('h2', {}, 'Exemplo em reais'), h('p', { class: 'desc' }, 'ST de um produto de R$ 100 em cada UF com ST.'),
      tabela([{ titulo: 'UF', valor: (uf) => h('b', {}, uf) }, ...CATEGORIAS.filter(k => k.cest).map(k => ({ titulo: k.nome, num: true, valor: (uf) => { const r = sim.porUf[uf][k.id]; return r?.temSt && !r.filial ? moeda(r.pctSt * 100) : '—'; } }))], comSt, { vazioTxt: 'Nenhuma UF com ST nesta simulação.' })),
    sim.brutos?.length ? jsonBruto(sim.brutos, 'Resposta completa do Tributei') : null
  );
}
