// Calculadora de ICMS-ST, FCP e antecipação (a antiga consulta_ncm_com_pdf.html) + confirmação no Tributei.
import { h, card, rotulo, chip, botao, aviso, carregando, jsonBruto, tabela, moeda, pctFmt, campo, select, toast, exportarXlsx, carimbo, lerArquivo, vazio } from '../ui.js';
import { config } from '../store.js';
import * as M from '../motor/motor-st.js';
import { tributeiDisponivel, consultar, confirmarPedido } from '../motor/tributei-st.js';

const p100 = (v) => (v == null || isNaN(v)) ? NaN : v / 100;           // motor usa 53,86 ; ui usa 0,5386
const ESTADOS = M.ESTADOS.map(([s, n]) => [s, `${s} · ${n}`]);
const fonteChip = (f, rot) => chip(rot, M.mvaConfiavel(f) ? (f === 'tributei' ? 'mini azul' : 'mini ok') : 'mini atencao');
const bate = (a, b) => Math.abs((a || 0) - (b || 0)) <= Math.max(0.05, Math.abs(b || 0) * 0.005);

function pills(opcoes, valor, aoMudar) {
  const box = h('div', { class: 'abas', style: { paddingBottom: '4px' } });
  const des = () => box.replaceChildren(...opcoes.map(([v, t]) => h('button', { class: valor === v ? 'on' : '', type: 'button', onclick: () => { valor = v; des(); aoMudar(v); } }, t)));
  des(); return box;
}

// Opções da operação (compartilhadas entre "1 produto" e "Pedido")
function opcoesOperacao(estado, aoMudar = () => {}) {
  const set = (k) => (v) => { estado[k] = v; aoMudar(); };
  const inOrigem = select(ESTADOS, estado.origem, { onchange: (e) => set('origem')(e.target.value) });
  const inDestino = select(ESTADOS, estado.destino, { onchange: (e) => set('destino')(e.target.value) });
  return h('div', {},
    h('div', { class: 'campos' }, campo('Estado de origem (remetente)', inOrigem), campo('Estado de destino (cliente)', inDestino)),
    rotulo('Cliente'),
    h('div', { style: { display: 'flex', flexWrap: 'wrap', columnGap: '16px' } },
      h('div', {}, h('div', { class: 'muted' }, 'Contribuinte de ICMS?'), pills([[true, 'Sim (revenda)'], [false, 'Não (consumidor final)']], estado.contribuinte, set('contribuinte'))),
      h('div', {}, h('div', { class: 'muted' }, 'Regime do cliente'), pills([['SN', 'Simples'], ['RN', 'Normal']], estado.regimeCliente, set('regimeCliente')))),
    rotulo('Minha empresa'),
    pills([['RN', 'Regime normal'], ['SN', 'Simples Nacional']], estado.regimeRemetente, set('regimeRemetente')),
    h('p', { class: 'muted', style: { margin: '4px 2px 0' } }, 'Remetente do Simples usa a MVA interna do destino, sem ajuste (Conv. ICMS 142/18, cl. 11, §1º).'));
}

function avancados(estado) {
  const inMva = h('input', { type: 'number', step: '0.01', placeholder: 'automática', oninput: (e) => (estado.mva = e.target.value === '' ? null : +e.target.value) });
  const inAliq = h('input', { type: 'number', step: '0.01', placeholder: 'automática', oninput: (e) => (estado.aliq = e.target.value === '' ? null : +e.target.value) });
  const inAj = h('input', { type: 'checkbox', onchange: (e) => (estado.mvaJaAjustada = e.target.checked) });
  return h('details', { class: 'card' }, h('summary', { style: { cursor: 'pointer', fontWeight: 700 } }, 'Ajustes avançados (normalmente não precisa)'),
    h('div', { class: 'campos', style: { marginTop: '12px' } }, campo('Forçar MVA (%)', inMva), campo('Forçar alíquota interna (%)', inAliq)),
    h('label', { class: 'check', style: { marginTop: '10px' } }, inAj, 'A MVA que digitei já é a ajustada'));
}

// ---------------------------------------------------------------------------
export default {
  id: 'pedidos',
  titulo: 'Calculadora de pedidos',
  subtitulo: 'ICMS-ST, FCP e antecipação · conferido no Tributei',
  resumo: 'Quanto o cliente paga em cada estado: 1 produto ou o pedido inteiro (CSV/PDF), com a base fiscal da Freedom',
  icone: 'preco', cor: 'rosa', largo: true,
  async render(el) {
    const c = config.get();
    const estado = { origem: c.uf, destino: 'MT', contribuinte: true, regimeCliente: 'SN', regimeRemetente: 'RN', mva: null, aliq: null, mvaJaAjustada: false };
    let aba = 'unico';
    const abas = h('div', { class: 'abas' });
    const corpo = h('div');
    const desenharAbas = () => {
      abas.replaceChildren(...[['unico', '1 produto'], ['pedido', 'Pedido (CSV/PDF)'], ['base', 'Base fiscal']].map(([v, t]) => h('button', { class: aba === v ? 'on' : '', onclick: () => { aba = v; desenharAbas(); abrir(); } }, t)));
    };
    const abrir = () => corpo.replaceChildren(aba === 'unico' ? telaUnico(estado) : aba === 'pedido' ? telaPedido(estado) : telaBase());
    el.append(abas, corpo);
    desenharAbas(); abrir();
  }
};

// ---------------------------------------------------------------------------
// 1 PRODUTO
function telaUnico(estado) {
  let sel = null; // { item, produto }
  let importado = false;
  const inBusca = h('input', { type: 'search', placeholder: 'Nome, código do produto ou NCM (ex.: fone, FO007, 85183000)', autocomplete: 'off' });
  const resultados = h('div');
  const selecionado = h('div');
  const form = h('div', { hidden: true });
  const saida = h('div');
  const inQtd = h('input', { type: 'number', value: 1, min: 1 });
  const inUnit = h('input', { type: 'number', step: '0.01', placeholder: '0,00' });
  const boxImp = h('div');

  const desenharImp = () => boxImp.replaceChildren(pills([[false, 'Nacional'], [true, 'Importado (4%)']], importado, (v) => (importado = v)));

  inBusca.oninput = () => {
    const r = M.buscar(inBusca.value);
    if (!inBusca.value.trim()) return resultados.replaceChildren();
    if (!r.produtos.length && !r.fiscais.length) return resultados.replaceChildren(vazio('Nada encontrado', 'Tente outra palavra, o código do produto ou o NCM.'));
    resultados.replaceChildren(
      r.produtos.length ? h('div', { class: 'rotulo' }, r.total > r.produtos.length ? `Produtos · ${r.total} encontrados, mostrando ${r.produtos.length}` : `Produtos (${r.total})`) : null,
      h('div', { class: 'lista' }, r.produtos.map(({ cod, p }) => {
        const f = M.NCM_CATALOG[p.classfiscal];
        return h('div', { class: 'it', style: { cursor: 'pointer' }, onclick: () => escolher(f, { cod, ...p }) },
          h('div', { class: 'ic azul' }, '◎'),
          h('div', {}, h('b', {}, p.desc), h('span', {}, `${cod} · NCM ${p.ncm || '—'}${p.preco ? ' · ' + moeda(p.preco) : ''}${f ? '' : ' · sem classificação fiscal'}`)));
      })),
      r.fiscais.length ? h('div', { class: 'rotulo' }, 'Classificações fiscais (por NCM)') : null,
      h('div', { class: 'lista' }, r.fiscais.map(i => h('div', { class: 'it', style: { cursor: 'pointer' }, onclick: () => escolher(i, null) },
        h('div', { class: 'ic ok' }, '#'), h('div', {}, h('b', {}, i.descricao), h('span', {}, `NCM ${i.ncm}${i.cest ? ' · CEST ' + i.cest : ' · sem CEST'}`))))));
  };

  function escolher(item, produto) {
    if (!item) return toast('Este produto não tem classificação fiscal válida no cadastro', 'erro');
    sel = { item, produto };
    importado = M.guessImportado(item.descricao); desenharImp();
    inBusca.value = ''; resultados.replaceChildren();
    if (produto?.preco) inUnit.value = produto.preco; else inUnit.value = '';
    selecionado.replaceChildren(card(h('div', { class: 'nota-cab' },
      h('div', {}, h('b', {}, produto ? produto.desc : item.descricao), h('div', { class: 'muted' }, `${produto ? produto.cod + ' · ' : ''}NCM ${item.ncm}${item.cest ? ' · CEST ' + item.cest : ' · sem CEST'}`), produto ? h('div', { class: 'muted' }, 'Fiscal: ' + item.descricao) : null),
      botao('Trocar', () => { sel = null; selecionado.replaceChildren(); form.hidden = true; saida.replaceChildren(); inBusca.focus(); }, 'secundario pequeno'))));
    form.hidden = false; saida.replaceChildren();
  }

  async function calcular() {
    if (!sel) return;
    const qtd = +inQtd.value, vu = +inUnit.value;
    if (!(qtd > 0) || !(vu > 0)) return toast('Preencha quantidade e valor unitário', 'erro');
    const r = M.fullCalc(sel.item, importado, estado.origem, estado.destino, qtd, vu, estado.regimeCliente, { mva: estado.mva, mvaJaAjustada: estado.mvaJaAjustada, aliqInterna: estado.aliq, regimeRemetente: estado.regimeRemetente });
    r._produto = sel.produto;
    mostrarUnico(saida, r, estado, null, true);
    if (await tributeiDisponivel()) {
      try {
        const t = await consultar({ item: sel.item, importado, origem: estado.origem, destino: estado.destino, qtd, valorUnit: vu, regimeCliente: estado.regimeCliente, regimeRemetente: estado.regimeRemetente, contribuinte: estado.contribuinte });
        mostrarUnico(saida, r, estado, t, false);
      } catch (e) { mostrarUnico(saida, r, estado, { ok: false, erro: e.message }, false); }
    } else mostrarUnico(saida, r, estado, null, false);
  }

  desenharImp();
  return h('div', {},
    card(h('h2', {}, '1. Produto'), inBusca, resultados),
    selecionado,
    h('div', {}, form),
    (form.append(
      card(h('h2', {}, '2. Operação'), opcoesOperacao(estado),
        rotulo('Produto'), boxImp,
        h('div', { class: 'campos', style: { marginTop: '8px' } }, campo('Quantidade', inQtd), campo('Valor unitário (R$)', inUnit, 'Vem do cadastro; mude se o preço negociado for outro.'))),
      avancados(estado),
      h('div', { class: 'acoes', style: { marginBottom: '12px' } }, botao('Calcular', calcular, 'primario cheio'))), null),
    saida);
}

function mostrarUnico(el, r, estado, t, consultando) {
  const { origem, destino } = estado;
  const tOk = t && t.ok;
  const stTab = r.icmsSTResult ? r.icmsSTResult.icmsST : 0;
  const fcpTab = r.fcpResult?.temFCP ? r.fcpResult.valor : 0;
  const antecip = r.antecipacaoResult?.devida ? r.antecipacaoResult.valor : 0;
  // Valor final: Tributei manda quando respondeu; senão, a tabela
  const st = tOk ? t.st : stTab, fcp = tOk ? t.fcp : fcpTab, difal = tOk ? t.difal : 0;
  const totalNota = r.valorMerc + st + fcp;
  const titulo = !estado.contribuinte
    ? (tOk ? `DIFAL em ${destino}: ${moeda(difal)}` : 'Consumidor final: DIFAL só pelo Tributei')
    : (st > 0 ? `Tem ICMS-ST em ${destino}` : (r.stIndefinido && !tOk ? `Tem ST em ${destino}, mas sem MVA para calcular` : `Sem ICMS-ST em ${destino}`));

  const linhaComp = (nome, vTab, vTrib, fmt = moeda) => ({ nome, tab: vTab, trib: tOk ? vTrib : null, fmt });
  const comp = [
    linhaComp('MVA aplicada', r.icmsSTResult ? r.icmsSTResult.mvaAplicada : null, t?.mvaAplicada, (v) => pctFmt(p100(v))),
    linhaComp('Alíquota interna', r.aliqInterna, t?.aliqInterna, (v) => pctFmt(p100(v))),
    linhaComp('Alíquota interestadual', r.alqInter, t?.aliqInter, (v) => pctFmt(p100(v))),
    linhaComp('Base do ST', r.icmsSTResult?.baseST, t?.baseSt),
    linhaComp('ICMS-ST', stTab, t?.st),
    linhaComp('FCP-ST', fcpTab, t?.fcp)
  ];

  el.replaceChildren(
    card(rotulo(`${origem} → ${destino}${r.internalOp ? ' · operação interna' : ''}`),
      h('div', { class: 'grande' }, estado.contribuinte ? moeda(totalNota) : moeda(r.valorMerc + difal)),
      h('div', { class: 'heroi' }, h('div', { class: 'linha' }, `${titulo} · total da nota${estado.contribuinte ? ' (produtos + ST + FCP-ST)' : ''}`),
        h('div', { class: 'chips' },
          chip(`${r._qtd} × ${moeda(r.valorMerc / r._qtd)}`),
          st > 0 ? chip('ST ' + moeda(st), 'rosa') : null, fcp > 0 ? chip('FCP-ST ' + moeda(fcp), 'rosa') : null,
          antecip > 0 ? chip('Antecipação ' + moeda(antecip), 'atencao') : null,
          tOk ? chip('✓ conferido no Tributei', 'azul') : consultando ? chip('consultando o Tributei…') : chip('só tabela da Freedom', 'atencao'))),
      st + fcp > 0 ? h('p', { class: 'muted', style: { margin: '8px 0 0' } }, `Impostos da nota = ${pctFmt((st + fcp) / r.valorMerc)} do valor · ${moeda((st + fcp) / r._qtd)} por unidade.`) : null),
    t && !t.ok ? aviso(`Não deu para conferir no Tributei: ${t.erro}. Valores abaixo são da tabela da Freedom.`, 'atencao') : null,
    estado.contribuinte ? card(h('h2', {}, 'Tabela da Freedom × Tributei'),
      tabela([
        { titulo: '', valor: (x) => x.nome },
        { titulo: 'Tabela', num: true, valor: (x) => x.tab == null ? '—' : x.fmt(x.tab) },
        { titulo: 'Tributei', num: true, valor: (x) => x.trib == null ? (consultando ? '…' : '—') : h('b', {}, x.fmt(x.trib)) },
        { titulo: '', valor: (x) => x.trib == null || x.tab == null ? '' : (bate(x.tab, x.trib) ? chip('✓', 'mini ok') : chip('difere', 'mini atencao')) }
      ], comp),
      r.mvaInfo ? h('div', { class: 'chips', style: { marginTop: '10px' } }, rotulo('MVA da tabela'), fonteChip(r.mvaInfo.fonte, r.mvaInfo.rotulo)) : null,
      tOk && t.quem ? h('p', { class: 'muted' }, `Tributei: quem recolhe = ${t.quem}${t.protocolo ? ' · ' + t.protocolo : ''}`) : null) : null,
    card(h('h2', {}, 'Detalhes'),
      h('div', { class: 'lista' },
        item(`ICMS-ST na tabela da Freedom: ${({ Sim: 'tem ST', Nao: 'sem ST', SemCEST: 'sem CEST', Verificar: 'a verificar' })[r.stStatus]}`, r.stStatus === 'Sim' ? 'azul' : r.stStatus === 'Verificar' ? 'atencao' : 'ok', r.stStatus === 'SemCEST' ? 'Sem CEST no cadastro fiscal: normalmente não há ST.' : r.stInfo ? `Base legal do segmento: ${r.stInfo.baseLegal}` : (r.stStatus === 'Verificar' ? 'NCM fora da matriz de ST da Freedom: use a resposta do Tributei.' : 'Sem ST neste estado.')),
        r.icmsSTResult?.mvaSemAjusteSN ? item('MVA sem ajuste', 'azul', `Remetente Simples: MVA interna de ${destino}, sem ajuste interestadual.`) : null,
        r.fcpResult ? item('FCP', r.fcpResult.temFCP ? 'atencao' : 'ok', r.fcpResult.motivo) : null,
        r.antecipacaoResult ? item('Antecipação (sem ST)', r.antecipacaoResult.devida ? 'atencao' : r.antecipacaoResult.status === 'Verificar' ? 'atencao' : 'ok', r.antecipacaoResult.motivo + (r.antecipacaoResult.devida ? ` Valor: ${moeda(r.antecipacaoResult.valor)} (o cliente recolhe no estado dele, fora da nota).` : '')) : null),
      r.icmsSTResult ? h('div', { class: 'lista', style: { marginTop: '10px' } }, item('Conta da tabela', 'azul', [
        `MVA original ${pctFmt(p100(r.icmsSTResult.mvaOriginal))} (${r.mvaInfo?.rotulo || '—'}) → aplicada ${pctFmt(p100(r.icmsSTResult.mvaAplicada))}`,
        `Base ST = ${moeda(r.valorMerc)} × (1 + ${pctFmt(p100(r.icmsSTResult.mvaAplicada))}) = ${moeda(r.icmsSTResult.baseST)}`,
        `ICMS-ST = ${moeda(r.icmsSTResult.baseST)} × ${pctFmt(p100(r.aliqInterna))} − ${moeda(r.icmsSTResult.icmsProprio)} = ${moeda(r.icmsSTResult.icmsST)}`
      ].join(' · '))) : null,
      h('div', { class: 'acoes' }, botao('Copiar resumo para o cliente', async (e) => {
        const L = [r._produto ? r._produto.desc : r.item.descricao, `NCM ${r.item.ncm} | ${origem} -> ${destino}`, '', `${r._qtd} un x ${moeda(r.valorMerc / r._qtd)} = ${moeda(r.valorMerc)}`];
        if (estado.contribuinte) { L.push(st > 0 ? `ICMS-ST: ${moeda(st)}` : 'ICMS-ST: não há'); if (fcp > 0) L.push(`FCP-ST: ${moeda(fcp)}`); L.push(`TOTAL DA NOTA: ${moeda(totalNota)}`); if (antecip > 0) L.push('', `Antecipação a recolher em ${destino}: ${moeda(antecip)}`); }
        else L.push(`DIFAL (${destino}): ${moeda(difal)}`);
        L.push('', tOk ? '* conferido no Tributei' : '* valores estimados - confirmar com o setor fiscal');
        try { await navigator.clipboard.writeText(L.join('\n')); e.target.textContent = 'Copiado ✓'; } catch { toast('Não deu para copiar', 'erro'); }
      }, 'secundario')),
      tOk ? jsonBruto(t.bruto) : null));
}

const item = (titulo, tipo, texto) => h('div', { class: 'it' }, h('div', { class: 'ic ' + tipo }, { erro: '!', atencao: '!', ok: '✓', azul: 'i' }[tipo]), h('div', {}, h('b', {}, titulo), h('span', {}, texto)));

// ---------------------------------------------------------------------------
// PEDIDO
function telaPedido(estado) {
  let pedido = null;
  const status = h('div');
  const saida = h('div');
  const inFile = h('input', { type: 'file', accept: '.csv,.txt,.pdf,text/csv,application/pdf', onchange: (e) => e.target.files[0] && ler(e.target.files[0]) });
  const zona = h('label', { class: 'arquivo' }, inFile, h('b', {}, 'Escolher o pedido (CSV ou PDF)'), h('span', {}, 'CSV do sistema (Cód. Prod., Qtde, Pr. C/ Desc.) ou PDF de orçamento/pedido'), h('span', { class: 'muted' }, 'O PDF precisa ter texto selecionável'));

  async function ler(file) {
    status.replaceChildren(carregando('Lendo o arquivo…'));
    try {
      const { data } = await lerArquivo(file);
      pedido = /\.pdf$/i.test(file.name) || file.type === 'application/pdf' ? await M.lerPedidoPDF(data) : M.lerPedidoCSV(M.decodificar(data));
      const comST = pedido.linhas.filter(l => l.icmsSTSistema > 0).length;
      const ruins = pedido.linhas.filter(l => !l.qtde || !l.preco || l.erro).length;
      status.replaceChildren(aviso(`${pedido.linhas.length} produto(s) lidos de ${file.name}.${pedido.temColunaST ? ` ${comST} já vêm com ICMS-ST do sistema.` : ''}${ruins ? ` ${ruins} linha(s) para conferir.` : ''}`, ruins ? 'atencao' : 'ok'));
    } catch (e) { pedido = null; status.replaceChildren(aviso('Erro ao ler: ' + e.message, 'erro')); }
    inFile.value = '';
  }

  async function calcular() {
    if (!pedido?.linhas.length) return toast('Escolha o arquivo do pedido primeiro', 'erro');
    const { origem, destino } = estado;
    const linhas = pedido.linhas.map(row => {
      const res = M.resolverLinha(row);
      if (!res || !row.qtde || !row.preco) return { row, erro: !res ? 'Produto/NCM não encontrado no cadastro fiscal' : 'Quantidade ou preço inválido' };
      const importado = M.guessImportado(res.item.descricao);
      try {
        const r = M.fullCalc(res.item, importado, origem, destino, row.qtde, row.preco, estado.regimeCliente, { icmsSTSistema: row.icmsSTSistema, mva: estado.mva, mvaJaAjustada: estado.mvaJaAjustada, aliqInterna: estado.aliq, regimeRemetente: estado.regimeRemetente });
        return { row, r, via: res.via, importado };
      } catch (e) { return { row, erro: 'Erro: ' + e.message }; }
    });
    mostrarPedido(saida, linhas, estado, 'tabela');
    if (await tributeiDisponivel()) {
      const prog = carregando(); saida.prepend(prog);
      await confirmarPedido(linhas, estado, (i, n) => (prog.lastChild.textContent = `Conferindo no Tributei: ${i} de ${n} NCM(s)…`));
      mostrarPedido(saida, linhas, estado, 'tributei');
    }
  }

  return h('div', {},
    card(h('h2', {}, '1. Operação (vale para o pedido todo)'), opcoesOperacao(estado)),
    avancados(estado),
    card(h('h2', {}, '2. Arquivo do pedido'), zona, status),
    h('div', { class: 'acoes', style: { marginBottom: '12px' } }, botao('Calcular pedido', calcular, 'primario cheio')),
    saida);
}

function mostrarPedido(el, linhas, estado, fase) {
  const { origem, destino } = estado;
  const ok = linhas.filter(l => l.r);
  const usaTrib = (l) => l.trib && l.trib.ok;
  const stL = (l) => usaTrib(l) ? l.trib.st : (l.r.icmsSTResult ? l.r.icmsSTResult.icmsST : 0);
  const fcpL = (l) => usaTrib(l) ? l.trib.fcp : (l.r.fcpResult?.temFCP ? l.r.fcpResult.valor : 0);
  const difL = (l) => usaTrib(l) ? l.trib.difal : 0;
  const antL = (l) => l.r.antecipacaoResult?.devida ? l.r.antecipacaoResult.valor : 0;
  const soma = (f) => ok.reduce((s, l) => s + f(l), 0);
  const merc = soma(l => l.r.valorMerc), st = soma(stL), fcp = soma(fcpL), dif = soma(difL), ant = soma(antL);
  const conferidas = ok.filter(usaTrib).length;
  const divergentes = ok.filter(l => usaTrib(l) && !bate(l.r.icmsSTResult ? l.r.icmsSTResult.icmsST : 0, l.trib.st));
  const erros = linhas.filter(l => l.erro);
  const total = merc + st + fcp;

  const exportar = () => exportarXlsx(`Pedido_${origem}-${destino}_${carimbo()}.xlsx`, [{
    nome: 'Pedido', linhas: [['Código', 'Produto', 'NCM', 'CEST', 'Origem', 'Qtde', 'Valor unit.', 'Valor total', 'MVA tabela %', 'MVA Tributei %', 'ICMS-ST tabela', 'ICMS-ST Tributei', 'ICMS-ST sistema', 'FCP-ST', 'DIFAL', 'Antecipação', 'Total', 'Fonte da MVA', 'Quem recolhe'],
      ...linhas.map(l => l.erro ? [l.row.codProduto, l.row.descricao, '', '', '', l.row.qtde, l.row.preco, '', '', '', '', '', l.row.icmsSTSistema || '', '', '', '', '', 'ERRO: ' + l.erro, ''] : [
        l.row.codProduto, l.row.descricao || l.r.item.descricao, l.r.item.ncm, l.r.item.cest || '', l.importado ? 'Importado' : 'Nacional', l.row.qtde, l.row.preco, +l.r.valorMerc.toFixed(2),
        l.r.icmsSTResult ? +l.r.icmsSTResult.mvaAplicada.toFixed(2) : '', usaTrib(l) && l.trib.mvaAplicada ? +l.trib.mvaAplicada.toFixed(2) : '',
        l.r.icmsSTResult ? +l.r.icmsSTResult.icmsST.toFixed(2) : 0, usaTrib(l) ? +l.trib.st.toFixed(2) : '', l.row.icmsSTSistema || '',
        +fcpL(l).toFixed(2), +difL(l).toFixed(2), +antL(l).toFixed(2), +(l.r.valorMerc + stL(l) + fcpL(l)).toFixed(2), l.r.mvaInfo?.rotulo || '', usaTrib(l) ? l.trib.quem : '']),
      [], ['TOTAIS', '', '', '', '', '', '', +merc.toFixed(2), '', '', '', '', '', +fcp.toFixed(2), +dif.toFixed(2), +ant.toFixed(2), +total.toFixed(2)]]
  }]);

  el.replaceChildren(
    card(rotulo(`Pedido ${origem} → ${destino}`),
      h('div', { class: 'grande' }, moeda(estado.contribuinte ? total : merc + dif)),
      h('div', { class: 'heroi' }, h('div', { class: 'linha' }, estado.contribuinte ? 'Total da nota (produtos + ICMS-ST + FCP-ST)' : 'Produtos + DIFAL (consumidor final)'),
        h('div', { class: 'chips' },
          chip(`${ok.length} item(ns) · ${moeda(merc)}`),
          st > 0 ? chip('ST ' + moeda(st), 'rosa') : null, fcp > 0 ? chip('FCP-ST ' + moeda(fcp), 'rosa') : null, dif > 0 ? chip('DIFAL ' + moeda(dif), 'rosa') : null,
          ant > 0 ? chip(`Antecipação ${moeda(ant)} (fora da nota)`, 'atencao') : null,
          fase === 'tributei' ? chip(`✓ ${conferidas}/${ok.length} conferidos no Tributei`, conferidas === ok.length ? 'azul' : 'atencao') : chip('só tabela da Freedom', 'atencao')))),
    erros.length ? aviso(`${erros.length} linha(s) não foram calculadas (produto não encontrado ou valor inválido). Veja na tabela.`, 'erro') : null,
    divergentes.length ? aviso(`${divergentes.length} item(ns) com ST da tabela diferente do Tributei. O total usa o Tributei. A MVA confirmada fica salva e corrige a tabela nos próximos cálculos.`, 'atencao') : null,
    card(h('h2', {}, 'Itens'),
      tabela([
        { titulo: 'Produto', valor: (l) => h('span', {}, h('b', {}, l.row.codProduto), ' ', String(l.row.descricao || l.r?.item.descricao || '').slice(0, 34)) },
        { titulo: 'Orig.', valor: (l) => l.r ? chip(l.importado ? 'IMP' : 'NAC', 'mini') : '' },
        { titulo: 'Qtd', num: true, valor: (l) => l.row.qtde },
        { titulo: 'Vlr un.', num: true, valor: (l) => moeda(l.row.preco) },
        { titulo: 'ST?', valor: (l) => l.erro ? chip(l.erro, 'mini erro') : chip(l.r.stStatus === 'SemCEST' ? 'NÃO' : l.r.stStatus.toUpperCase().replace('NAO', 'NÃO'), l.r.stStatus === 'Sim' ? 'mini rosa' : l.r.stStatus === 'Verificar' ? 'mini atencao' : 'mini') },
        { titulo: 'ST tabela', num: true, valor: (l) => l.r ? (l.r.stIndefinido ? chip('sem MVA', 'mini atencao') : moeda(l.r.icmsSTResult ? l.r.icmsSTResult.icmsST : 0)) : '' },
        { titulo: 'ST Tributei', num: true, valor: (l) => !l.r ? '' : l.trib ? (l.trib.ok ? h('b', {}, moeda(l.trib.st)) : chip('erro', 'mini erro')) : (fase === 'tabela' ? '…' : '—') },
        { titulo: 'FCP-ST', num: true, valor: (l) => l.r ? moeda(fcpL(l)) : '' },
        { titulo: 'Antecip.', num: true, valor: (l) => l.r ? moeda(antL(l)) : '' },
        { titulo: 'Total', num: true, valor: (l) => l.r ? h('b', {}, moeda(l.r.valorMerc + stL(l) + fcpL(l))) : '' },
        { titulo: 'MVA', valor: (l) => l.r?.mvaInfo ? fonteChip(usaTrib(l) && l.trib.temSt ? 'tributei' : l.r.mvaInfo.fonte, usaTrib(l) && l.trib.temSt ? 'Tributei ' + pctFmt(p100(l.trib.mvaAplicada)) : l.r.mvaInfo.rotulo) : '' }
      ], linhas, { classeLinha: (l) => l.erro ? 'div' : divergentes.includes(l) ? 'alerta' : '' }),
      h('div', { class: 'acoes' },
        botao('Exportar planilha', exportar, 'secundario'),
        botao('Copiar resumo', async (e) => {
          const L = [`Pedido ${origem} -> ${destino}`, '', `Produtos: ${moeda(merc)}`];
          if (st > 0) L.push(`ICMS-ST: ${moeda(st)}`); if (fcp > 0) L.push(`FCP-ST: ${moeda(fcp)}`); if (dif > 0) L.push(`DIFAL: ${moeda(dif)}`);
          L.push(`TOTAL DA NOTA: ${moeda(estado.contribuinte ? total : merc + dif)}`);
          if (ant > 0) L.push('', `Antecipação a recolher em ${destino}: ${moeda(ant)}`);
          L.push('', fase === 'tributei' && conferidas === ok.length ? '* conferido no Tributei' : '* valores estimados - confirmar com o setor fiscal');
          try { await navigator.clipboard.writeText(L.join('\n')); e.target.textContent = 'Copiado ✓'; } catch { toast('Não deu para copiar', 'erro'); }
        }, 'secundario'))));
}

// ---------------------------------------------------------------------------
// BASE FISCAL
function telaBase() {
  const info = h('div');
  const desenhar = () => {
    const ap = Object.entries(M.MVA_APRENDIDA), tr = Object.entries(M.MVA_TRIBUTEI);
    info.replaceChildren(
      card(rotulo('Base fiscal no aparelho'),
        h('div', { class: 'grade', style: { marginTop: '8px' } },
          ind('Classificações', Object.keys(M.NCM_CATALOG).length, 'NCMs do cadastro fiscal'),
          ind('Produtos', Object.keys(M.PRODUCT_REGISTRY).length, 'com código e preço'),
          ind('MVA oficial', Object.keys(M.MVA.oficial).length, 'NCMs com tabela'),
          ind('Confirmadas', tr.length, 'MVAs vindas do Tributei')),
        M.baseAlterada() ? aviso('Você está usando um cadastro importado neste aparelho.', 'info') : null),
      card(h('h2', {}, 'MVAs confirmadas e aprendidas'),
        h('p', { class: 'desc' }, 'Cada cálculo conferido no Tributei grava a MVA daquele NCM no estado. Pedidos do sistema que já trazem ICMS-ST também ensinam a MVA. Elas passam a valer antes das estimativas.'),
        tr.length || ap.length ? tabela([{ titulo: 'NCM', valor: (x) => x.k.split('|')[0] }, { titulo: 'UF', valor: (x) => x.k.split('|')[1] }, { titulo: 'Origem', valor: (x) => x.tipo }, { titulo: 'MVA original', num: true, valor: (x) => pctFmt(p100(x.mva)) }],
          [...tr.map(([k, v]) => ({ k, tipo: `Tributei (${k.split('|')[2] === 'I' ? 'importado' : 'nacional'})`, mva: v.mvaOriginal })), ...ap.map(([k, v]) => ({ k, tipo: 'pedido do sistema', mva: v }))]) : vazio('Nenhuma ainda', 'Calcule produtos ou pedidos com a chave do Tributei.'),
        h('div', { class: 'acoes' },
          botao('Exportar MVAs', () => exportarXlsx(`MVAs_${carimbo()}.xlsx`, [{ nome: 'MVAs', linhas: [['NCM', 'UF', 'Origem', 'MVA original %', 'MVA aplicada %', 'Quando'], ...tr.map(([k, v]) => [k.split('|')[0], k.split('|')[1], 'Tributei ' + (k.split('|')[2] === 'I' ? 'importado' : 'nacional'), +v.mvaOriginal.toFixed(4), +v.mvaAplicada.toFixed(4), v.quando]), ...ap.map(([k, v]) => [k.split('|')[0], k.split('|')[1], 'pedido do sistema', +v.toFixed(4), '', ''])] }]), 'secundario'),
          botao('Apagar', () => { if (confirm('Apagar as MVAs confirmadas e aprendidas deste aparelho?')) { M.limparAprendidas(); desenhar(); } }, 'perigo'))),
      card(h('h2', {}, 'Atualizar cadastro'),
        h('p', { class: 'desc' }, 'Mande os CSVs exportados do sistema. Agora a atualização fica salva no aparelho (antes valia só até fechar a aba).'),
        arquivoCsv('Tabela de NCMs (NCM.csv)', 'CODCLASSFISCAL, DESCRICAO, COD_NCM, PERCIPI, PERCNAC, PERCIMP, PERCEST, CEST', M.importarCatalogoCSV),
        arquivoCsv('Cadastro de produtos (produtos_cadastrados.csv)', 'CODPRODUTO, PRODUTO, COD_NCM, CODCLASSFISCAL, SITUACAO, PRECOVENDA', M.importarProdutosCSV),
        h('div', { class: 'acoes' }, botao('Voltar à base original', () => { if (confirm('Voltar à base que veio com o app?')) { M.restaurarBase(); desenhar(); toast('Base original restaurada', 'ok'); } }, 'secundario'))));
  };
  const arquivoCsv = (titulo, colunas, fn) => {
    const st = h('div');
    const inp = h('input', { type: 'file', accept: '.csv,.txt', style: { display: 'none' }, onchange: async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { const { data } = await lerArquivo(f); const n = fn(M.decodificar(data)); st.replaceChildren(aviso(`${n} registros carregados e salvos.`, 'ok')); desenhar(); }
      catch (err) { st.replaceChildren(aviso(err.message, 'erro')); }
      e.target.value = '';
    } });
    return h('div', { style: { marginTop: '10px' } }, inp, botao(titulo, () => inp.click(), 'secundario cheio'), h('div', { class: 'muted', style: { margin: '4px 2px' } }, 'Colunas: ' + colunas), st);
  };
  desenhar();
  return info;
}
const ind = (r, v, l) => h('div', { class: 'card ind' }, h('div', { class: 'r' }, r), h('div', { class: 'v' }, Number(v).toLocaleString('pt-BR')), h('div', { class: 'l' }, l));
