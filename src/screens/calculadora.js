// Simulação rápida completa: todos os campos que a API aceita, várias UFs de uma vez.
import { h, card, rotulo, chip, botao, aviso, carregando, mostrarErro, jsonBruto, tabela, moeda, pctFmt, campo, select, toast, exportarXlsx, carimbo, dataHora } from '../ui.js';
import { api } from '../api.js';
import { config, dados } from '../store.js';
import { UFS, CATEGORIAS, fmtNcm, fmtCest, soDigitos } from '../data.js';
import { linhasSimulacao, temStFornecedor } from '../extrair.js';
import { calcularSt } from '../calc.js';
import { tem } from '../acessos.js';
import { chave } from '../store.js';

const n = (inp) => { const v = Number(String(inp.value).replace(',', '.')); return isNaN(v) ? 0 : v; };

export default {
  id: 'calculadora',
  titulo: 'Simulação rápida',
  subtitulo: 'Todos os campos da API · ST ou DIFAL',
  resumo: 'Calcula ST ou DIFAL de qualquer NCM, com frete, IPI e desconto, para várias UFs de uma vez',
  icone: 'calc', cor: 'rosa', largo: true,
  async render(el) {
    const c = config.get();
    const produtos = dados.produtos();
    let operacao = 'venda', calculo = 'icmsst';
    const destinos = new Set(['MT']);

    const abasOp = h('div', { class: 'abas' }); const abasCalc = h('div', { class: 'abas' });
    const desenharAbas = () => {
      abasOp.replaceChildren(...[['venda', 'Venda'], ['compra', 'Compra']].map(([v, t]) => h('button', { class: operacao === v ? 'on' : '', onclick: () => { operacao = v; ajustarOperacao(); desenharAbas(); } }, t)));
      abasCalc.replaceChildren(...[['icmsst', 'ICMS-ST'], ['difal', 'DIFAL']].map(([v, t]) => h('button', { class: calculo === v ? 'on' : '', onclick: () => { calculo = v; desenharAbas(); } }, t)));
    };

    const inOrigem = select(UFS, c.uf);
    const ufsBox = h('div', { class: 'ufs' });
    const desenharUfs = () => {
      ufsBox.replaceChildren(...UFS.map(uf => h('label', { class: destinos.has(uf) ? 'on' : '', onclick: () => { destinos.has(uf) ? destinos.delete(uf) : destinos.add(uf); desenharUfs(); mostrarExtras(); } }, uf)));
    };
    const ajustarOperacao = () => {
      // Compra: Freedom é o destino; Venda: Freedom é a origem
      if (operacao === 'compra') { destinos.clear(); destinos.add(c.uf); inOrigem.value = inOrigem.value === c.uf ? 'SP' : inOrigem.value; }
      else { inOrigem.value = c.uf; if (destinos.has(c.uf) && destinos.size === 1) { destinos.clear(); destinos.add('MT'); } }
      desenharUfs(); mostrarExtras();
    };

    // Produto
    const inProd = select([['', 'Digitar NCM e valor'], ...CATEGORIAS.filter(k => k.cest).map(k => ['cat:' + k.id, `${k.nome} · ${k.ncm}`]), ...produtos.map((p, i) => ['p:' + i, `${p.ref} · ${p.nome}`])], 'cat:fones');
    const inNcm = h('input', { type: 'text', inputmode: 'numeric', placeholder: '0000.00.00' });
    const inCest = h('input', { type: 'text', inputmode: 'numeric', placeholder: '00.000.00' });
    const inImp = h('input', { type: 'checkbox', checked: true });
    const inQtd = h('input', { type: 'number', value: 1, min: 1 });
    const inUnit = h('input', { type: 'number', step: '0.01', value: 100 });
    const preencher = () => {
      const v = inProd.value;
      if (v.startsWith('cat:')) { const k = CATEGORIAS.find(x => x.id === v.slice(4)); inNcm.value = k.ncm; inCest.value = k.cest; }
      if (v.startsWith('p:')) { const p = produtos[+v.slice(2)]; const k = CATEGORIAS.find(x => x.id === p.cat); inNcm.value = k.ncm; inCest.value = k.cest; inUnit.value = p.custo; inImp.checked = p.importado !== false; }
    };
    inProd.onchange = preencher; preencher();

    // Valores adicionais
    const campos = {
      vFrete: h('input', { type: 'number', step: '0.01', placeholder: '0,00' }),
      vSeg: h('input', { type: 'number', step: '0.01', placeholder: '0,00' }),
      IPI: h('input', { type: 'number', step: '0.01', placeholder: '0,00' }),
      cOutro: h('input', { type: 'number', step: '0.01', placeholder: '0,00' }),
      vDescIC: h('input', { type: 'number', step: '0.01', placeholder: '0,00' }),
      vDescC: h('input', { type: 'number', step: '0.01', placeholder: '0,00' }),
      vICMS: h('input', { type: 'number', step: '0.01', placeholder: 'automático' })
    };

    // Cadastro do cliente
    const inDestSimples = h('input', { type: 'checkbox' });
    const inEmitSimples = h('input', { type: 'checkbox' });
    const inMT = select([['mva_original_two_b', 'Art. 2º-B · Demais'], ['mva_original_two_a', 'Art. 2º-A · Atacadista'], ['mva_original_one', 'Art. 1º · Simples / créd. outorgado']], c.regraMT);
    const inCredSP = h('input', { type: 'number', step: '0.01', placeholder: 'padrão' });
    const boxMT = campo('Regra do MT', inMT); const boxSP = campo('Alíquota de crédito SP (%)', inCredSP, 'Só para operação interna em SP');
    const mostrarExtras = () => { boxMT.hidden = !destinos.has('MT') && inOrigem.value !== 'MT'; boxSP.hidden = !(inOrigem.value === 'SP' && destinos.has('SP')); };
    inOrigem.onchange = mostrarExtras;

    const saida = h('div');

    const montarCorpo = () => {
      const corpo = {
        tipoOperacao: operacao, tipoCalculo: calculo,
        destinatario_simples: inDestSimples.checked ? '1' : '2', simples: inEmitSimples.checked ? '1' : '2',
        estado_emit: [inOrigem.value], estado_dest: UFS.filter(u => destinos.has(u)),
        importado: inImp.checked, ncm: fmtNcm(inNcm.value), cest: fmtCest(inCest.value),
        quantidade: Math.max(1, Math.round(n(inQtd))), vUnit: n(inUnit)
      };
      if (!boxMT.hidden) corpo.cliente_atuacao = inMT.value;
      for (const [k, inp] of Object.entries(campos)) if (inp.value !== '') corpo[k] = n(inp);
      if (!boxSP.hidden && inCredSP.value !== '') corpo.aliquota_credito = n(inCredSP);
      return corpo;
    };

    let ultimoPedido = 0;
    const calcular = async ({ silencioso = false, soApp = false } = {}) => {
      const corpo = montarCorpo();
      const avisar = (m) => silencioso ? null : toast(m, 'erro');
      if (!corpo.estado_dest.length) return avisar('Escolha pelo menos uma UF de destino');
      if (soDigitos(corpo.ncm).length !== 8) return avisar('NCM precisa ter 8 dígitos');
      if (!corpo.vUnit) return avisar('Informe o valor unitário');
      const pedido = ++ultimoPedido;
      const usarApi = !soApp && !!(await chave.ler()) && tem('simulacao') !== false;
      if (!usarApi) return mostrar(corpo, [], null, 'Cálculo feito pelo app com a tabela de MVA da ficha (sem consultar o Tributei).');
      saida.replaceChildren(carregando());
      try {
        const r = await api.simulacao(corpo);
        if (pedido !== ultimoPedido) return; // já mudou de novo
        const linhas = linhasSimulacao(r);
        dados.registrarCalculo({ quando: new Date().toISOString(), corpo, linhas: linhas.map(({ bruto, ...l }) => l) });
        mostrar(corpo, linhas, r);
      } catch (e) {
        if (pedido !== ultimoPedido) return;
        mostrar(corpo, [], null, `Tributei não respondeu (${e.message}). Mostrando o cálculo do app com a tabela de MVA da ficha.`);
      }
    };
    // Cálculo automático: recalcula sozinho quando algum campo muda
    const inAuto = h('input', { type: 'checkbox', checked: true });
    let timer;
    const agendar = () => { if (!inAuto.checked) return; clearTimeout(timer); timer = setTimeout(() => calcular({ silencioso: true }), 900); };
    el.addEventListener('input', (e) => { if (e.target !== inAuto) agendar(); });
    el.addEventListener('change', (e) => { if (e.target !== inAuto) agendar(); });
    el.addEventListener('click', (e) => { if (e.target.closest('.ufs label, .abas button')) agendar(); });

    function mostrar(corpo, linhasApi, bruto, nota) {
      const qtd = corpo.quantidade, totalProd = qtd * corpo.vUnit;
      const v = { vProd: totalProd, vFrete: corpo.vFrete || 0, vSeg: corpo.vSeg || 0, IPI: corpo.IPI || 0, cOutro: corpo.cOutro || 0, vDescIC: corpo.vDescIC || 0 };
      const extras = v.vFrete + v.vSeg + v.IPI + v.cOutro - v.vDescIC;
      const difal = calculo === 'difal';
      // Uma linha por UF: o que o Tributei devolveu + a conta do app
      const linhas = corpo.estado_dest.map(uf => {
        const api = linhasApi.find(l => l.uf === uf);
        const loc = calcularSt({ ncm: corpo.ncm, origem: corpo.estado_emit[0], destino: uf, importado: corpo.importado, valores: v });
        const temSt = api ? temStFornecedor(api) : loc.temSt;
        const st = difal ? (api?.difal || 0) : (api ? (temSt ? api.valorSt || 0 : 0) : (loc.st || 0));
        return { uf, api, loc, temSt, st, fonte: api ? 'Tributei' : 'app' };
      });
      const comImposto = linhas.filter(l => l.st > 0);
      const unica = linhas.length === 1 ? linhas[0] : null;
      const mvaMostrar = (l) => l.api && !isNaN(l.api.mva) ? l.api.mva : l.loc.mvaAjustada;
      saida.replaceChildren(
        nota ? aviso(nota, 'info') : null,
        card(rotulo(`${corpo.tipoOperacao === 'venda' ? 'Venda' : 'Compra'} · ${difal ? 'DIFAL' : 'ICMS-ST'} · ${corpo.ncm}`),
          h('div', { class: 'grande' }, unica ? moeda(unica.st) : `${comImposto.length} de ${linhas.length} UFs com ${difal ? 'DIFAL' : 'ST'}`),
          h('div', { class: 'heroi' }, h('div', { class: 'linha' }, `${qtd} × ${moeda(corpo.vUnit)} = ${moeda(totalProd)}${extras ? ' · extras ' + moeda(extras) : ''} · origem ${corpo.estado_emit[0]}${corpo.importado ? ' · importado' : ''}`),
            h('div', { class: 'chips' },
              unica && !difal && unica.loc.mvaOriginal != null ? chip('MVA original ' + pctFmt(unica.loc.mvaOriginal)) : null,
              unica && !difal && unica.temSt ? chip('MVA aplicada ' + pctFmt(mvaMostrar(unica)), 'rosa') : null,
              unica?.api?.quem ? chip(unica.api.quem, unica.temSt ? 'ok' : 'atencao') : null,
              unica ? chip('Final ' + moeda((totalProd + extras + unica.st) / qtd) + '/un') : null))),
        card(h('h2', {}, 'Resultado por UF'),
          tabela([
            { titulo: 'UF', valor: (l) => h('b', {}, l.uf) },
            { titulo: 'MVA original', num: true, valor: (l) => pctFmt(l.loc.mvaOriginal) },
            { titulo: 'MVA aplicada', num: true, valor: (l) => l.temSt ? pctFmt(mvaMostrar(l)) : '—' },
            { titulo: 'Interna', num: true, valor: (l) => pctFmt(l.api?.aliqInterna ?? l.loc.intra) },
            { titulo: 'Interest.', num: true, valor: (l) => pctFmt(l.api?.aliqInter ?? l.loc.inter) },
            { titulo: 'Base ST', num: true, valor: (l) => l.temSt ? moeda(!isNaN(l.api?.base) ? l.api.base : l.loc.baseSt) : '—' },
            { titulo: difal ? 'DIFAL' : 'ICMS-ST', num: true, valor: (l) => h('b', {}, moeda(l.st)) },
            { titulo: 'Conta do app', num: true, valor: (l) => difal || !l.api ? '—' : (Math.abs((l.loc.st || 0) - l.st) < 0.05 ? chip('✓ bate', 'mini ok') : chip(moeda(l.loc.st || 0), 'mini atencao')) },
            { titulo: 'Quem recolhe', valor: (l) => l.api?.quem ? chip(l.api.quem, l.temSt ? 'mini ok' : 'mini atencao') : (l.temSt ? chip('fornecedor (app)', 'mini') : '—') },
            { titulo: 'Total c/ imposto', num: true, valor: (l) => moeda(totalProd + extras + l.st) },
            { titulo: 'Unitário final', num: true, valor: (l) => moeda((totalProd + extras + l.st) / qtd) },
            { titulo: 'Fonte', valor: (l) => chip(l.fonte, l.fonte === 'Tributei' ? 'mini azul' : 'mini') }
          ], linhas, { classeLinha: (l) => l.st > 0 ? 'sel' : '' }),
          h('div', { class: 'acoes' }, botao('Exportar planilha', () => exportarXlsx(`Simulacao-rapida_${carimbo()}.xlsx`, [{
            nome: 'Resultado', linhas: [['UF', 'NCM', 'CEST', 'Qtd', 'Valor unit.', 'MVA original %', 'MVA aplicada %', 'Alíq. interna %', 'Alíq. interestadual %', 'Base ST', difal ? 'DIFAL' : 'ICMS-ST', 'Conta do app', 'Quem recolhe', 'Total c/ imposto', 'Unitário final', 'Fonte', 'Protocolo'],
              ...linhas.map(l => [l.uf, corpo.ncm, corpo.cest, qtd, corpo.vUnit, l.loc.mvaOriginal == null ? '' : +(l.loc.mvaOriginal * 100).toFixed(2), l.temSt ? +(mvaMostrar(l) * 100).toFixed(2) : '', +((l.api?.aliqInterna ?? l.loc.intra) * 100).toFixed(2), +((l.api?.aliqInter ?? l.loc.inter) * 100).toFixed(2), l.temSt ? +(!isNaN(l.api?.base) ? l.api.base : l.loc.baseSt).toFixed(2) : '', +l.st.toFixed(2), +(l.loc.st || 0).toFixed(2), l.api?.quem || '', +(totalProd + extras + l.st).toFixed(2), +((totalProd + extras + l.st) / qtd).toFixed(2), l.fonte, l.api?.protocolo || '']),
              [], ['Memória de cálculo (app)'], ...linhas.flatMap(l => [[l.uf], ...l.loc.memoria.map(m => ['', m])])]
          }]), 'secundario'))),
        card(h('h2', {}, 'Memória de cálculo'), h('p', { class: 'desc' }, 'Passo a passo da conta feita pelo app (tabela de MVA da ficha + alíquotas internas), para conferir com o Tributei.'),
          h('div', { class: 'lista' }, linhas.map(l => h('div', { class: 'it' },
            h('div', { class: 'ic ' + (l.st > 0 ? 'azul' : 'ok') }, l.uf),
            h('div', {}, l.loc.memoria.map(m => h('span', { style: { display: 'block' } }, m))))))),
        bruto ? jsonBruto(bruto) : null);
    }

    const historico = dados.calculos();
    el.append(
      card(h('div', { style: { display: 'flex', flexWrap: 'wrap', columnGap: '16px' } }, h('div', {}, rotulo('Operação'), abasOp), h('div', {}, rotulo('Cálculo'), abasCalc)),
        rotulo('Origem'), campo('UF de origem (emitente)', inOrigem),
        rotulo('Destinos'), ufsBox,
        h('div', { class: 'acoes' }, botao('Todas', () => { UFS.forEach(u => destinos.add(u)); desenharUfs(); mostrarExtras(); }, 'secundario pequeno'), botao('Limpar', () => { destinos.clear(); desenharUfs(); mostrarExtras(); }, 'secundario pequeno'))),
      card(h('h2', {}, 'Produto'),
        campo('Escolher', inProd),
        h('div', { class: 'campos', style: { marginTop: '10px' } }, campo('NCM', inNcm), campo('CEST', inCest), campo('Quantidade', inQtd), campo('Valor unitário (R$)', inUnit)),
        h('label', { class: 'check', style: { marginTop: '12px' } }, inImp, 'Produto importado (alíquota interestadual de 4%)')),
      h('details', { class: 'card' }, h('summary', { style: { cursor: 'pointer', fontWeight: 700 } }, 'Frete, IPI, desconto e cadastro do cliente'),
        h('div', { class: 'campos', style: { marginTop: '12px' } },
          campo('Frete (R$)', campos.vFrete), campo('Seguro (R$)', campos.vSeg), campo('IPI (R$)', campos.IPI), campo('Outras despesas (R$)', campos.cOutro),
          campo('Desconto incondicional (R$)', campos.vDescIC), campo('Desconto condicional (R$)', campos.vDescC), campo('ICMS próprio (R$)', campos.vICMS, 'Deixe vazio para o Tributei calcular'), boxMT, boxSP),
        h('label', { class: 'check', style: { marginTop: '12px' } }, inDestSimples, 'Destinatário é do Simples Nacional'),
        h('label', { class: 'check', style: { marginTop: '8px' } }, inEmitSimples, 'Emitente é do Simples Nacional')),
      h('div', { class: 'acoes', style: { marginBottom: '12px' } }, botao('Calcular no Tributei', () => calcular(), 'primario'), botao('Calcular só no app', () => calcular({ soApp: true }), 'secundario')),
      h('label', { class: 'check', style: { margin: '0 2px 12px' } }, inAuto, 'Calcular sozinho quando eu mudar algum campo'),
      saida,
      historico.length ? card(h('h2', {}, 'Últimos cálculos'), tabela([
        { titulo: 'Quando', valor: (x) => dataHora(new Date(x.quando)) },
        { titulo: 'Operação', valor: (x) => `${x.corpo.tipoOperacao} · ${x.corpo.tipoCalculo}` },
        { titulo: 'NCM', valor: (x) => x.corpo.ncm },
        { titulo: 'Rota', valor: (x) => `${x.corpo.estado_emit[0]} → ${x.corpo.estado_dest.length > 3 ? x.corpo.estado_dest.length + ' UFs' : x.corpo.estado_dest.join(', ')}` },
        { titulo: 'Valor', num: true, valor: (x) => moeda(x.corpo.vUnit * x.corpo.quantidade) }
      ], historico.slice(0, 8))) : null);
    desenharAbas(); desenharUfs(); mostrarExtras();
    calcular({ silencioso: true });
  }
};
