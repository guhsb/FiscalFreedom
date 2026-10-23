// Margens e orçamentos por rede: mix de produtos, custo, custos variáveis, margem alvo, ST e PDF.
import { h, card, rotulo, chip, botao, aviso, carregando, tabela, moeda, pctFmt, campo, select, toast, exportarXlsx, carimbo, lerArquivo, vazio, salvarArquivo, dataHora } from '../ui.js';
import { config } from '../store.js';
import { UFS } from '../data.js';
import * as M from '../motor/motor-st.js';
import * as R from '../redes/dados-redes.js';
import { tributeiDisponivel, confirmarPedido } from '../motor/tributei-st.js';
import { gerarPdfOrcamento, lerPdfEmbutido } from '../redes/pdf-orcamento.js';

const pct = (v) => pctFmt(v, 1);
const corMargem = (m, alvo) => isNaN(m) ? '' : m < 0 ? 'erro' : m < alvo ? 'atencao' : 'ok';
const num = (v) => { const n = M.toNum(v); return isNaN(n) ? null : n; };

// Estado da sessão (sobrevive à troca de abas)
const S = { aba: 'margens', redeId: null, sel: new Set(), filtro: '', orc: null, tributei: {}, modo: 'facil' };

export default {
  id: 'redes',
  titulo: 'Margens e orçamentos',
  subtitulo: 'Por rede · custo, comissão, frete, ST e PDF',
  resumo: 'Escolhe os itens da rede, ajusta margem ou preço com todos os custos e gera o orçamento em PDF; o PDF volta para conferir o que mudou',
  icone: 'preco', cor: 'verde', largo: true,
  async render(el) {
    const lista = R.redes();
    if (!S.redeId || !R.rede(S.redeId)) S.redeId = lista[0]?.id;
    const abas = h('div', { class: 'abas' });
    const corpo = h('div');
    const desenharAbas = () => abas.replaceChildren(...[['margens', 'Margens'], ['orcamento', 'Orçamento'], ['conferir', 'Conferir PDF'], ['config', 'Custos e redes']].map(([v, t]) => h('button', { class: S.aba === v ? 'on' : '', onclick: () => { S.aba = v; desenharAbas(); abrir(); } }, t)));
    const avisoCusto = h('div');
    const abrir = () => {
      const f = { margens: telaMargens, orcamento: telaOrcamento, conferir: telaConferir, config: telaConfig }[S.aba];
      avisoCusto.replaceChildren(R.custosInfo() ? '' : cardSenha(() => abrir()));
      corpo.replaceChildren(f(() => { desenharAbas(); abrir(); }));
    };
    el.append(avisoCusto, abas, corpo);
    desenharAbas(); abrir();
  }
};

function seletorRede(aoMudar) {
  const s = select(R.redes().map(r => [r.id, `${r.nome} · ${r.uf} · ${r.itens.length} itens`]), S.redeId, { onchange: (e) => { S.redeId = e.target.value; S.sel.clear(); S.orc = null; aoMudar(); } });
  return campo('Rede', s);
}

// Destrava os custos embutidos no app
function cardSenha(depois) {
  if (!R.temCustosEmbutidos()) return aviso(h('span', {}, 'Importe o CSV de produtos do sistema (com PRECOCUSTO) em ', h('b', {}, 'Custos e redes'), ' para calcular as margens.'), 'atencao');
  const inSenha = h('input', { type: 'password', placeholder: 'Senha dos custos', autocomplete: 'off', onkeydown: (e) => e.key === 'Enter' && ir() });
  const msg = h('div');
  async function ir() {
    msg.replaceChildren(carregando('Abrindo…'));
    try { const r = await R.desbloquearCustos(inSenha.value); toast(`Custos liberados: ${r.comCusto} produtos`, 'ok'); depois(); }
    catch (e) { msg.replaceChildren(aviso(e.message, 'erro')); }
  }
  return card(h('h2', {}, 'Custos protegidos por senha'),
    h('p', { class: 'desc' }, 'Os custos de todos os produtos já vêm no app, trancados. Digite a senha uma vez neste aparelho para ver as margens.'),
    h('div', { class: 'campos' }, campo('Senha', inSenha), h('div', { style: { alignSelf: 'end' } }, botao('Liberar custos', ir, 'primario cheio'))), msg);
}

// ===================================================================== MARGENS
function telaMargens(reabrir) {
  const rd = R.rede(S.redeId);
  if (!rd) return card(vazio('Nenhuma rede', 'Crie uma rede em "Custos e redes".'));
  const salvar = () => R.salvarRede(rd);
  const area = h('div');
  const alvo = () => (rd.margemAlvo || 0) / 100;

  // ---- configuração da rede
  const inUf = select(UFS, rd.uf, { onchange: (e) => { rd.uf = e.target.value; salvar(); desenhar(); } });
  const inAlvo = h('input', { type: 'number', step: '0.5', value: rd.margemAlvo, onchange: (e) => { rd.margemAlvo = +e.target.value || 0; salvar(); desenhar(); } });
  const inArred = select([['90', 'Terminar em ,90'], ['99', 'Terminar em ,99'], ['inteiro', 'Inteiro'], ['none', 'Sem arredondar']], rd.arred || '90', { onchange: (e) => { rd.arred = e.target.value; salvar(); } });
  const inContrib = select([['1', 'Contribuinte (revenda)'], ['0', 'Consumidor final']], rd.contribuinte === false ? '0' : '1', { onchange: (e) => { rd.contribuinte = e.target.value === '1'; salvar(); desenhar(); } });
  const inReg = select([['SN', 'Simples Nacional'], ['RN', 'Regime normal']], rd.regimeCliente, { onchange: (e) => { rd.regimeCliente = e.target.value; salvar(); desenhar(); } });

  const boxCustos = h('div');
  const desenharCustos = () => boxCustos.replaceChildren(h('div', { class: 'campos tres' }, R.custosVarRede(rd).map(c => campo(`${c.nome} %`, h('input', {
    type: 'number', step: '0.1', value: c.pct, style: c.daRede ? { borderColor: 'var(--rosa)' } : {},
    onchange: (e) => { rd.custosVar = { ...(rd.custosVar || {}), [c.id]: e.target.value === '' ? null : +e.target.value }; salvar(); desenhar(); desenharCustos(); }
  })))), h('p', { class: 'muted', style: { margin: '6px 2px 0' } }, `Total de custos variáveis: ${pct(R.totalCustosVar(rd))} · ICMS próprio automático (${config.get().uf} → ${rd.uf}). Borda rosa = valor só desta rede.`));
  desenharCustos();

  // ---- adicionar itens
  const inBusca = h('input', { type: 'search', placeholder: 'Buscar no cadastro para adicionar (nome, código ou NCM)' });
  const resBusca = h('div');
  inBusca.oninput = () => {
    const q = inBusca.value.trim(); if (!q) return resBusca.replaceChildren();
    const r = M.buscar(q, 40);
    const jaTem = new Set(rd.itens.map(i => i.cod));
    resBusca.replaceChildren(r.produtos.length ? h('div', { class: 'lista', style: { maxHeight: '320px', overflow: 'auto' } }, r.produtos.map(({ cod, p }) => {
      const inf = R.infoProduto(cod);
      return h('div', { class: 'it' },
        h('div', { class: 'ic ' + (jaTem.has(cod) ? 'ok' : 'azul') }, jaTem.has(cod) ? '✓' : '+'),
        h('div', { style: { flex: 1 } }, h('b', {}, p.desc), h('span', {}, `${cod} · custo ${moeda(inf.custo)} · venda ${moeda(inf.precoTabela)}${inf.estoque != null ? ' · estoque ' + inf.estoque : ''}`)),
        jaTem.has(cod) ? null : botao('Adicionar', () => { rd.itens.push({ cod, nome: p.desc, familia: inf.cadastro?.ncm ? '' : '', qtd: 0, preco: null }); salvar(); inBusca.oninput(); desenhar(); }, 'secundario pequeno'));
    })) : vazio('Nada encontrado'));
  };
  const inCodigos = h('textarea', { rows: 2, placeholder: 'Ou cole vários códigos (um por linha ou separados por vírgula)' });
  const addCodigos = () => {
    const cods = inCodigos.value.split(/[\s,;]+/).map(x => x.trim()).filter(Boolean);
    const jaTem = new Set(rd.itens.map(i => i.cod)); let n = 0, nao = [];
    for (const c of cods) { if (jaTem.has(c)) continue; const inf = R.infoProduto(c); if (!inf.cadastro && !inf.custo) { nao.push(c); continue; } rd.itens.push({ cod: c, nome: inf.descricao, qtd: 0, preco: null }); jaTem.add(c); n++; }
    salvar(); inCodigos.value = ''; desenhar(); toast(`${n} item(ns) adicionados${nao.length ? ` · não achei: ${nao.slice(0, 5).join(', ')}` : ''}`, nao.length ? 'erro' : 'ok');
  };

  // ---- ações em massa
  const selecionados = () => rd.itens.filter(i => S.sel.has(i.cod));
  const alvoEmMassa = h('input', { type: 'number', step: '0.5', placeholder: String(rd.margemAlvo) });
  const aplicarMargem = (itens) => {
    const m = alvoEmMassa.value === '' ? alvo() : (+alvoEmMassa.value) / 100;
    let n = 0;
    for (const it of itens) { const l = R.linhaItem(rd, it); const p = R.precoParaMargem({ custo: l.info.custo, icms: l.icms, var: l.var, alvo: m, arred: rd.arred }); if (p > 0) { it.preco = p; n++; } }
    salvar(); desenhar(); toast(`Margem de ${pct(m)} aplicada em ${n} item(ns)`, 'ok');
  };

  function desenhar() {
    const q = M.normalize(S.filtro);
    const linhas = rd.itens.map(it => R.linhaItem(rd, it)).filter(l => !q || M.normalize(l.it.cod + ' ' + (l.it.nome || l.info.descricao) + ' ' + (l.it.familia || '')).includes(q));
    const todas = rd.itens.map(it => R.linhaItem(rd, it));
    const comCusto = todas.filter(l => l.info.custo > 0 && l.preco > 0);
    const receita = comCusto.reduce((s, l) => s + l.preco, 0), lucro = comCusto.reduce((s, l) => s + l.lucro, 0);
    const abaixo = comCusto.filter(l => l.margem < alvo());
    const semCusto = todas.filter(l => !(l.info.custo > 0));
    const abaixoMin = todas.filter(l => l.abaixoMinimo);
    const trib = (l) => S.tributei[`${rd.id}|${rd.uf}|${l.it.cod}`];
    const stLinha = (l) => { const t = trib(l); return t && t.ok && Math.abs(t.preco - l.preco) < 0.005 ? t.st + t.fcp + (t.difal || 0) : l.impostoCliente; };

    const inMargem = (l) => h('input', { type: 'number', step: '0.5', value: isNaN(l.margem) ? '' : (l.margem * 100).toFixed(1), style: { width: '78px', textAlign: 'right' }, disabled: !(l.info.custo > 0),
      onchange: (e) => { const p = R.precoParaMargem({ custo: l.info.custo, icms: l.icms, var: l.var, alvo: (+e.target.value) / 100, arred: rd.arred }); if (p > 0) { l.it.preco = p; salvar(); desenhar(); } else toast('Margem impossível com esses custos', 'erro'); } });
    const inPreco = (l) => h('input', { type: 'number', step: '0.01', value: l.preco ?? '', style: { width: '92px', textAlign: 'right', ...(l.it.preco != null ? { borderColor: 'var(--rosa)' } : {}) },
      onchange: (e) => { l.it.preco = e.target.value === '' ? null : +e.target.value; salvar(); desenhar(); } });

    area.replaceChildren(
      card(rotulo(`${rd.nome} · ${config.get().uf} → ${rd.uf}`),
        h('div', { class: 'grande' }, receita ? pct(lucro / receita) : '—'),
        h('div', { class: 'heroi' }, h('div', { class: 'linha' }, `margem líquida média do mix (1 unidade de cada) · alvo ${pct(alvo())}`),
          h('div', { class: 'chips' }, chip(`${rd.itens.length} itens`), !comCusto.length ? null : abaixo.length ? chip(`▼ ${abaixo.length} abaixo do alvo`, 'atencao') : chip('▲ todos no alvo', 'ok'),
            semCusto.length ? chip(`${semCusto.length} sem custo`, 'erro') : null, abaixoMin.length ? chip(`${abaixoMin.length} abaixo do preço mínimo`, 'erro') : null))),
      card(h('div', { class: 'campos' }, campo('Filtrar itens', h('input', { type: 'search', value: S.filtro, placeholder: 'código, nome ou família', oninput: (e) => { S.filtro = e.target.value; clearTimeout(S.t); S.t = setTimeout(desenhar, 250); } })),
        campo('Margem p/ selecionados (%)', alvoEmMassa)),
        h('div', { class: 'acoes' },
          botao(`Aplicar margem nos ${S.sel.size || 'selecionados'}`, () => S.sel.size ? aplicarMargem(selecionados()) : toast('Marque os itens na tabela', 'erro'), 'primario'),
          botao('Aplicar em todos', () => aplicarMargem(rd.itens), 'secundario'),
          botao('Voltar ao preço de tabela', () => { (S.sel.size ? selecionados() : rd.itens).forEach(i => (i.preco = null)); salvar(); desenhar(); }, 'secundario'),
          botao('Conferir ST no Tributei', conferirSt, 'secundario'),
          botao('Remover selecionados', () => { if (!S.sel.size) return; if (!confirm(`Tirar ${S.sel.size} item(ns) da rede?`)) return; rd.itens = rd.itens.filter(i => !S.sel.has(i.cod)); S.sel.clear(); salvar(); desenhar(); }, 'perigo'))),
      h('div', { class: 'abas' }, ...[['facil', 'Modo fácil'], ['tabela', 'Tabela completa']].map(([v, t]) => h('button', { class: S.modo === v ? 'on' : '', onclick: () => { S.modo = v; desenhar(); } }, t))),
      S.modo === 'facil' ? explicacao() : null,
      S.modo === 'facil' ? h('div', { class: 'cards-margem' }, linhas.length ? linhas.map(l => cartaoFacil(l, rd, alvo(), stLinha(l), () => { salvar(); desenhar(); })) : vazio('Nenhum item', 'Busque no cadastro abaixo para adicionar.')) : null,
      card(S.modo === 'facil' ? null : tabela([
        { titulo: h('input', { type: 'checkbox', checked: linhas.length && linhas.every(l => S.sel.has(l.it.cod)), onchange: (e) => { linhas.forEach(l => e.target.checked ? S.sel.add(l.it.cod) : S.sel.delete(l.it.cod)); desenhar(); } }), valor: (l) => h('input', { type: 'checkbox', checked: S.sel.has(l.it.cod), onchange: (e) => { e.target.checked ? S.sel.add(l.it.cod) : S.sel.delete(l.it.cod); } }) },
        { titulo: 'Código', valor: (l) => h('b', {}, l.it.cod) },
        { titulo: 'Produto', valor: (l) => h('span', { title: l.info.descricao }, String(l.it.nome || l.info.descricao).slice(0, 34), l.it.familia ? h('div', { class: 'muted' }, l.it.familia) : null) },
        { titulo: 'Custo', num: true, valor: (l) => l.info.custo > 0 ? moeda(l.info.custo) : chip('sem custo', 'mini erro') },
        { titulo: 'Tabela', num: true, valor: (l) => moeda(l.info.precoTabela) },
        { titulo: 'Preço rede', num: true, valor: inPreco },
        { titulo: 'Margem %', num: true, valor: inMargem },
        { titulo: 'Situação', valor: (l) => isNaN(l.margem) ? '—' : chip(l.margem < 0 ? '✕ prejuízo' : l.margem < alvo() ? '▼ abaixo' : '▲ no alvo', 'mini ' + corMargem(l.margem, alvo())) },
        { titulo: 'Lucro un.', num: true, valor: (l) => moeda(l.lucro) },
        { titulo: 'ICMS + custos', num: true, valor: (l) => moeda((l.icmsValor || 0) + (l.varValor || 0)) },
        { titulo: 'ST un.', num: true, valor: (l) => { const v = stLinha(l); const t = trib(l); return h('span', {}, v ? moeda(v) : '—', t?.ok ? h('div', { class: 'muted' }, 'Tributei') : null); } },
        { titulo: 'Final c/ ST', num: true, valor: (l) => h('b', {}, moeda((l.preco || 0) + stLinha(l))) },
        { titulo: 'Mínimo', num: true, valor: (l) => l.info.minimo ? h('span', { style: l.abaixoMinimo ? { color: 'var(--vermelho-t)', fontWeight: 700 } : {} }, moeda(l.info.minimo)) : '—' }
      ], linhas, { classeLinha: (l) => l.margem < 0 ? 'div' : l.abaixoMinimo ? 'alerta' : '', vazioTxt: 'Nenhum item. Busque no cadastro abaixo para adicionar.' }),
        h('div', { class: 'acoes' }, botao('Exportar planilha de margens', () => exportarMargens(rd), 'secundario'), botao('Fazer orçamento com estes preços', () => { S.aba = 'orcamento'; reabrir(); }, 'secundario'))),
      semCusto.length || abaixoMin.length || abaixo.length ? card(h('h2', {}, 'O que merece atenção'), h('div', { class: 'lista' },
        [...todas.filter(l => l.margem < 0).map(l => ['erro', '✕', `${l.it.cod}: prejuízo`, `Preço ${moeda(l.preco)} não cobre custo ${moeda(l.info.custo)} + impostos e custos variáveis.`]),
          ...abaixoMin.map(l => ['erro', '!', `${l.it.cod}: abaixo do preço mínimo`, `Preço ${moeda(l.preco)} · mínimo do sistema ${moeda(l.info.minimo)}.`]),
          ...semCusto.slice(0, 5).map(l => ['atencao', '?', `${l.it.cod}: sem custo`, 'Importe o CSV de produtos com PRECOCUSTO para calcular a margem.']),
          ...abaixo.filter(l => l.margem >= 0).slice(0, 5).map(l => ['atencao', '▼', `${l.it.cod}: margem ${pct(l.margem)}`, `Para ${pct(alvo())}, o preço seria ${moeda(R.precoParaMargem({ custo: l.info.custo, icms: l.icms, var: l.var, alvo: alvo(), arred: rd.arred }))}.`])
        ].slice(0, 8).map(([t, ic, b, s]) => h('div', { class: 'it' }, h('div', { class: 'ic ' + t }, ic), h('div', {}, h('b', {}, b), h('span', {}, s)))))) : null
    );
  }

  async function conferirSt() {
    if (!(await tributeiDisponivel())) return toast('Sem chave do Tributei (ou sem acesso à simulação)', 'erro');
    if (R.ehFilial(rd.uf)) return toast(`${rd.uf} tem filial: sai livre de ST e DIFAL, não precisa conferir`, 'ok');
    const linhas = rd.itens.map(it => R.linhaItem(rd, it)).filter(l => l.info.fiscal && l.preco > 0);
    const ls = linhas.map(l => ({ r: { item: l.info.fiscal, valorMerc: l.preco }, importado: l.info.importado, l }));
    toast('Conferindo no Tributei…');
    await confirmarPedido(ls, { origem: config.get().uf, destino: rd.uf, regimeCliente: rd.regimeCliente, regimeRemetente: 'RN', contribuinte: rd.contribuinte !== false });
    for (const x of ls) S.tributei[`${rd.id}|${rd.uf}|${x.l.it.cod}`] = x.trib?.ok ? { ok: true, st: x.trib.st, fcp: x.trib.fcp, difal: x.trib.difal, preco: x.l.preco } : { ok: false };
    desenhar(); toast(`${ls.filter(x => x.trib?.ok).length} de ${ls.length} itens conferidos`, 'ok');
  }

  desenhar();
  return h('div', {},
    card(h('div', { class: 'campos' }, seletorRede(reabrir), campo('UF de destino', inUf), campo('Margem alvo (%)', inAlvo), campo('Arredondar preço', inArred), campo('Cliente', inContrib), campo('Regime do cliente', inReg))),
    h('details', { class: 'card' }, h('summary', { style: { cursor: 'pointer', fontWeight: 700 } }, `Custos variáveis da rede (comissão, frete, impostos…) · ${pct(R.totalCustosVar(rd))}`), h('div', { style: { marginTop: '12px' } }, boxCustos)),
    area,
    card(h('h2', {}, 'Adicionar itens à rede'), inBusca, resBusca, h('div', { style: { marginTop: '10px' } }, inCodigos), h('div', { class: 'acoes' }, botao('Adicionar códigos', addCodigos, 'secundario'))));
}

// ---------- Modo fácil ----------
function explicacao() {
  return card(h('h2', {}, 'Como funciona a margem (bem simples)'),
    h('div', { class: 'lista' },
      h('div', { class: 'it' }, h('div', { class: 'ic azul' }, '1'), h('div', {}, h('b', {}, 'O preço paga 4 coisas'), h('span', {}, 'O custo do produto, os impostos da Freedom, a comissão/frete e o que sobra para a empresa. O que sobra é a margem.'))),
      h('div', { class: 'it' }, h('div', { class: 'ic ok' }, '2'), h('div', {}, h('b', {}, 'Margem de 30% = sobram R$ 30 de cada R$ 100 vendidos'), h('span', {}, 'Depois de pagar tudo. Quanto maior a margem, mais caro fica para a rede.'))),
      h('div', { class: 'it' }, h('div', { class: 'ic atencao' }, '3'), h('div', {}, h('b', {}, 'Use os botões ou arraste a barra'), h('span', {}, '"Mais barato" diminui o que sobra; "Mais caro" aumenta. O preço muda sozinho. Vermelho = prejuízo, laranja = abaixo do alvo, verde = bom.')))));
}

function cartaoFacil(l, rd, alvo, impostoCli, salvarEDesenhar) {
  const nome = String(l.it.nome || l.info.descricao || l.it.cod);
  if (!(l.info.custo > 0)) {
    return h('div', { class: 'card mf' }, h('div', { class: 'mf-top' }, h('div', {}, h('b', {}, nome), h('div', { class: 'muted' }, l.it.cod)), chip('sem custo', 'mini erro')),
      h('p', { class: 'muted' }, 'Sem o custo não dá para calcular a margem. Importe o CSV de produtos em "Custos e redes".'));
  }
  const setMargem = (m) => { const p = R.precoParaMargem({ custo: l.info.custo, icms: l.icms, var: l.var, alvo: m, arred: rd.arred }); if (p > 0) { l.it.preco = p; salvarEDesenhar(); } else toast('Não dá: com esses custos essa margem é impossível', 'erro'); };
  const m = l.margem, cor = corMargem(m, alvo);
  const estado = m < 0 ? '✕ Prejuízo: o preço não paga os custos' : m < alvo ? `▼ Abaixo do alvo de ${pct(alvo)}` : `✓ Bom: acima do alvo de ${pct(alvo)}`;
  const partes = [['Custo', l.info.custo, 'var(--tx3)'], ['Impostos Freedom', l.icmsValor, 'var(--laranja)'], ['Comissão, frete etc.', l.varValor, 'var(--violeta)'], ['Sobra (margem)', Math.max(0, l.lucro), 'var(--verde)']];
  const total = partes.reduce((s, x) => s + x[1], 0) || 1;
  const slider = h('input', { type: 'range', min: -10, max: 70, step: 1, value: Math.round(m * 100), class: 'mf-slider',
    oninput: (e) => (e.target.nextSibling.textContent = e.target.value + '%'),
    onchange: (e) => setMargem(+e.target.value / 100) });
  return h('div', { class: 'card mf mf-' + cor },
    h('div', { class: 'mf-top' }, h('div', {}, h('b', {}, nome.slice(0, 48)), h('div', { class: 'muted' }, `${l.it.cod} · custa ${moeda(l.info.custo)} para nós`)), chip(pct(m), cor)),
    h('div', { class: 'mf-preco' }, h('span', { class: 'muted' }, 'Vende por'), h('div', { class: 'grande' }, moeda(l.preco)),
      h('div', { class: 'muted' }, impostoCli > 0 ? `Para o cliente: ${moeda(l.preco + impostoCli)} com ${l.difal ? 'DIFAL' : 'ICMS-ST'}` : l.filial ? `Livre de ST/DIFAL (filial ${rd.uf})` : 'Sem ICMS-ST para o cliente')),
    h('div', { class: 'mf-barra', title: 'Para onde vai o dinheiro de cada venda' }, partes.map(([n, v, c]) => h('i', { style: { width: (v / total * 100) + '%', background: c }, title: `${n}: ${moeda(v)}` }))),
    h('div', { class: 'mf-legenda' }, partes.map(([n, v, c]) => h('span', {}, h('i', { style: { background: c } }), `${n} ${moeda(v)}`))),
    h('p', { class: 'mf-frase' }, l.lucro >= 0 ? `Sobram ${moeda(l.lucro)} por unidade = ${pct(m)} de cada venda.` : `Perde ${moeda(-l.lucro)} por unidade vendida.`, ' ', h('b', { class: 'mf-estado' }, estado)),
    h('div', { class: 'mf-ctrl' },
      botao('− Mais barato', () => setMargem(m - 0.02), 'secundario pequeno'),
      h('div', { class: 'mf-range' }, slider, h('span', {}, Math.round(m * 100) + '%')),
      botao('+ Mais caro', () => setMargem(m + 0.02), 'secundario pequeno')),
    h('div', { class: 'acoes', style: { marginTop: '8px' } },
      botao(`Usar o alvo (${pct(alvo)})`, () => setMargem(alvo), 'secundario pequeno'),
      l.it.preco != null ? botao(`Voltar à tabela (${moeda(l.info.precoTabela)})`, () => { l.it.preco = null; salvarEDesenhar(); }, 'secundario pequeno') : null),
    l.abaixoMinimo ? aviso(`Abaixo do preço mínimo do sistema (${moeda(l.info.minimo)}).`, 'erro') : null);
}

function exportarMargens(rd) {
  const ls = rd.itens.map(it => R.linhaItem(rd, it));
  exportarXlsx(`Margens_${rd.nome.replace(/\W+/g, '-')}_${carimbo()}.xlsx`, [{
    nome: 'Margens', linhas: [['Código', 'Produto', 'Família', 'Custo', 'Preço tabela', 'Preço rede', 'ICMS próprio %', 'Custos variáveis %', 'Lucro un.', 'Margem líquida %', 'Markup %', 'ST un.', 'Final c/ ST', 'Preço mínimo'],
      ...ls.map(l => [l.it.cod, l.it.nome || l.info.descricao, l.it.familia || '', l.info.custo, l.info.precoTabela, l.preco, +(l.icms * 100).toFixed(2), +(l.var * 100).toFixed(2), isNaN(l.lucro) ? '' : +l.lucro.toFixed(2), isNaN(l.margem) ? '' : +(l.margem * 100).toFixed(2), isNaN(l.markup) ? '' : +(l.markup * 100).toFixed(2), +(l.st + l.fcp).toFixed(2), +l.finalComSt.toFixed(2), l.info.minimo || ''])]
  }, { nome: 'Custos variáveis', linhas: [['Custo', '%'], ...R.custosVarRede(rd).map(c => [c.nome, c.pct])] }]);
}

// ===================================================================== ORÇAMENTO
function novoOrc(rd) {
  return { redeId: rd.id, lojaCod: '', qtd: Object.fromEntries(rd.itens.filter(i => i.qtd > 0).map(i => [i.cod, i.qtd])), precoPdf: {}, vendedor: rd.lojas?.[0]?.vendedor || '', condicao: '28 dias', validadeDias: 7, obs: '', origem: null };
}

function telaOrcamento(reabrir) {
  const rd = R.rede(S.redeId);
  if (!rd) return card(vazio('Nenhuma rede'));
  if (!S.orc || S.orc.redeId !== rd.id) S.orc = novoOrc(rd);
  const O = S.orc;
  const area = h('div');
  const loja = () => rd.lojas.find(l => l.cod === O.lojaCod) || null;
  const destino = () => loja()?.uf || rd.uf;

  const inLoja = select([['', `Rede inteira (${rd.nome})`], ...rd.lojas.map(l => [l.cod, `${l.cod} - ${l.razao} · ${l.cidade}/${l.uf}${l.situacao === 'INATIVO' ? ' (inativo)' : ''}`])], O.lojaCod, { onchange: (e) => { O.lojaCod = e.target.value; const lj = loja(); if (lj?.vendedor) O.vendedor = lj.vendedor; desenhar(); } });
  const inVend = h('input', { type: 'text', value: O.vendedor, oninput: (e) => (O.vendedor = e.target.value) });
  const inCond = h('input', { type: 'text', value: O.condicao, oninput: (e) => (O.condicao = e.target.value) });
  const inVal = h('input', { type: 'number', value: O.validadeDias, oninput: (e) => (O.validadeDias = +e.target.value || 7) });
  const inObs = h('textarea', { rows: 2, placeholder: 'Observações que vão no PDF', oninput: (e) => (O.obs = e.target.value) }, O.obs);
  let soQtd = false;

  const linhaOrc = (it) => {
    const base = { ...it, preco: O.precoPdf[it.cod] ?? it.preco };
    const l = R.linhaItem(rd, base, destino());
    const q = +O.qtd[it.cod] || 0;
    return { ...l, qtd: q };
  };

  function desenhar() {
    const todas = rd.itens.map(linhaOrc);
    const vis = soQtd ? todas.filter(l => l.qtd > 0) : todas;
    const comQtd = todas.filter(l => l.qtd > 0);
    const tot = comQtd.reduce((a, l) => ({ produtos: a.produtos + l.preco * l.qtd, st: a.st + l.st * l.qtd, fcp: a.fcp + l.fcp * l.qtd, difal: a.difal + l.difal * l.qtd, lucro: a.lucro + (isNaN(l.lucro) ? 0 : l.lucro * l.qtd), receitaC: a.receitaC + (l.info.custo > 0 ? l.preco * l.qtd : 0), pecas: a.pecas + l.qtd }), { produtos: 0, st: 0, fcp: 0, difal: 0, lucro: 0, receitaC: 0, pecas: 0 });
    const total = tot.produtos + tot.st + tot.fcp + tot.difal;
    const livre = R.ehFilial(destino());
    const margemOrc = tot.receitaC ? tot.lucro / tot.receitaC : NaN;
    area.replaceChildren(
      O.origem ? aviso(`Reaberto do PDF ${O.origem}. ${Object.keys(O.precoPdf).length ? 'Usando os preços que estavam no PDF.' : 'Usando os preços de hoje.'}`, 'info') : null,
      card(rotulo(`Orçamento · ${loja() ? loja().razao : rd.nome} · ${config.get().uf} → ${destino()}`),
        h('div', { class: 'grande' }, moeda(total)),
        h('div', { class: 'heroi' }, h('div', { class: 'linha' }, `${comQtd.length} itens · ${tot.pecas} peças · produtos ${moeda(tot.produtos)}${tot.st + tot.fcp ? ' · ICMS-ST ' + moeda(tot.st + tot.fcp) : ''}${tot.difal ? ' · DIFAL ' + moeda(tot.difal) : ''}`),
          h('div', { class: 'chips' }, livre ? chip(`Livre de ST e DIFAL · filial ${destino()}`, 'ok') : null, chip(`Margem ${isNaN(margemOrc) ? '—' : pct(margemOrc)} (só para você)`, corMargem(margemOrc, (rd.margemAlvo || 0) / 100) || ''), chip(`Lucro ${moeda(tot.lucro)}`)))),
      card(h('div', { class: 'acoes', style: { marginTop: 0 } },
          h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: soQtd, onchange: (e) => { soQtd = e.target.checked; desenhar(); } }), 'Só itens com quantidade'),
          botao('Zerar quantidades', () => { O.qtd = {}; desenhar(); }, 'secundario pequeno'),
          botao('Usar quantidades sugeridas', () => { rd.itens.forEach(i => { if (i.qtd > 0) O.qtd[i.cod] = i.qtd; }); desenhar(); }, 'secundario pequeno')),
        tabela([
          { titulo: 'Código', valor: (l) => h('b', {}, l.it.cod) },
          { titulo: 'Produto', valor: (l) => String(l.it.nome || l.info.descricao).slice(0, 36) },
          { titulo: 'Qtd', num: true, valor: (l) => h('input', { type: 'number', min: 0, value: l.qtd || '', style: { width: '70px', textAlign: 'right' }, onchange: (e) => { O.qtd[l.it.cod] = +e.target.value || 0; desenhar(); } }) },
          { titulo: 'Vlr unit.', num: true, valor: (l) => h('span', {}, moeda(l.preco), O.precoPdf[l.it.cod] != null ? h('div', { class: 'muted' }, 'do PDF') : null) },
          { titulo: 'Vlr total', num: true, valor: (l) => l.qtd ? moeda(l.preco * l.qtd) : '—' },
          { titulo: 'ICMS-ST', num: true, valor: (l) => l.filial ? chip('livre', 'mini ok') : l.qtd && l.st + l.fcp ? moeda((l.st + l.fcp) * l.qtd) : '—' },
          { titulo: 'DIFAL', num: true, valor: (l) => l.filial ? chip('livre', 'mini ok') : l.qtd && l.difal ? moeda(l.difal * l.qtd) : '—' },
          { titulo: 'Total c/ impostos', num: true, valor: (l) => l.qtd ? h('b', {}, moeda(l.finalComSt * l.qtd)) : '—' },
          { titulo: 'Margem', num: true, valor: (l) => isNaN(l.margem) ? '—' : chip(pct(l.margem), 'mini ' + corMargem(l.margem, (rd.margemAlvo || 0) / 100)) }
        ], vis, { classeLinha: (l) => l.qtd > 0 ? 'sel' : '' })),
      card(h('div', { class: 'campos' }, campo('Cliente', inLoja), campo('Vendedor', inVend), campo('Condição de pagamento', inCond), campo('Validade (dias)', inVal)),
        h('div', { style: { marginTop: '10px' } }, campo('Observações', inObs)),
        h('div', { class: 'acoes' }, botao('Gerar PDF do orçamento', () => gerar(comQtd, tot, total), 'primario'), botao('Planilha interna (com margens)', () => exportarOrc(comQtd, tot), 'secundario'))));
  }

  async function gerar(itens, tot, total) {
    if (!itens.length) return toast('Coloque quantidade em pelo menos um item', 'erro');
    const agora = new Date();
    const numero = `${rd.nome.replace(/\W+/g, '').slice(0, 6).toUpperCase()}-${carimbo()}`;
    const orc = {
      numero, iso: agora.toISOString(), data: agora.toLocaleDateString('pt-BR'), validadeDias: O.validadeDias,
      rede: { id: rd.id, nome: rd.nome, uf: rd.uf }, loja: loja(), vendedor: O.vendedor, condicao: O.condicao, obs: O.obs,
      itens: itens.map(l => ({ cod: l.it.cod, codCliente: l.it.codCliente || '', nome: l.it.nome || l.info.descricao, qtd: l.qtd, preco: l.preco, st: l.st, fcp: l.fcp, difal: l.difal })),
      livre: R.ehFilial(destino()),
      totais: { produtos: +tot.produtos.toFixed(2), st: +tot.st.toFixed(2), fcp: +tot.fcp.toFixed(2), difal: +tot.difal.toFixed(2), total: +total.toFixed(2) }
    };
    try {
      const b64 = await gerarPdfOrcamento(orc);
      R.salvarOrcamento({ ...orc, margem: tot.receitaC ? tot.lucro / tot.receitaC : null });
      await salvarArquivo(`Orcamento_${numero}.pdf`, b64, 'application/pdf');
      toast('PDF gerado', 'ok');
    } catch (e) { toast('Erro ao gerar o PDF: ' + e.message, 'erro'); }
  }

  function exportarOrc(itens, tot) {
    exportarXlsx(`Orcamento-interno_${rd.nome.replace(/\W+/g, '-')}_${carimbo()}.xlsx`, [{
      nome: 'Orçamento', linhas: [['Código', 'Produto', 'Qtd', 'Custo', 'Vlr unit.', 'ST/DIFAL un.', 'Total c/ impostos', 'Lucro', 'Margem %'],
        ...itens.map(l => [l.it.cod, l.it.nome || l.info.descricao, l.qtd, l.info.custo, l.preco, +(l.st + l.fcp + l.difal).toFixed(2), +(l.finalComSt * l.qtd).toFixed(2), isNaN(l.lucro) ? '' : +(l.lucro * l.qtd).toFixed(2), isNaN(l.margem) ? '' : +(l.margem * 100).toFixed(2)]),
        [], ['TOTAL', '', tot.pecas, '', +tot.produtos.toFixed(2), +(tot.st + tot.fcp + tot.difal).toFixed(2), +(tot.produtos + tot.st + tot.fcp + tot.difal).toFixed(2), +tot.lucro.toFixed(2), tot.receitaC ? +(tot.lucro / tot.receitaC * 100).toFixed(2) : '']]
    }]);
  }

  desenhar();
  const hist = R.orcamentos().filter(o => o.rede.id === rd.id).slice(0, 8);
  return h('div', {}, card(h('div', { class: 'campos' }, seletorRede(reabrir))), area,
    hist.length ? card(h('h2', {}, 'Últimos orçamentos desta rede'), tabela([
      { titulo: 'Nº', valor: (o) => h('b', {}, o.numero) }, { titulo: 'Data', chave: 'data' }, { titulo: 'Cliente', valor: (o) => o.loja?.razao || o.rede.nome },
      { titulo: 'Total', num: true, valor: (o) => moeda(o.totais.total) }, { titulo: 'Margem', num: true, valor: (o) => o.margem == null ? '—' : pct(o.margem) }
    ], hist)) : null);
}

// ===================================================================== CONFERIR PDF
function telaConferir(reabrir) {
  const saida = h('div');
  const inFile = h('input', { type: 'file', accept: '.pdf,application/pdf', onchange: (e) => e.target.files[0] && ler(e.target.files[0]) });
  const zona = h('label', { class: 'arquivo' }, inFile, h('b', {}, 'Jogar o PDF do orçamento aqui'), h('span', {}, 'O app lê os dados escondidos no PDF e mostra o que mudou desde que ele foi feito'), h('span', { class: 'muted' }, 'Também aceita o PDF de pedido do painel da Rede Sander'));

  async function ler(file) {
    saida.replaceChildren(carregando('Lendo o PDF…'));
    try {
      const { data } = await lerArquivo(file);
      const r = await lerPdfEmbutido(data);
      if (r.tipo === 'orcamento') mostrarDiff(r.dados, file.name); else mostrarSander(r.dados, file.name);
    } catch (e) { saida.replaceChildren(aviso(e.message, 'erro')); }
    inFile.value = '';
  }

  function mostrarDiff(d, nome) {
    let rd = R.rede(d.rede.id) || R.redes().find(x => x.nome === d.rede.nome);
    if (!rd) return saida.replaceChildren(aviso(`A rede "${d.rede.nome}" do PDF não existe mais neste aparelho.`, 'erro'));
    const destino = d.loja?.uf || rd.uf;
    const mix = new Map(rd.itens.map(i => [i.cod, i]));
    const linhas = d.itens.map(pi => {
      const it = mix.get(pi.cod);
      const hoje = R.linhaItem(rd, it || { cod: pi.cod, preco: null }, destino);
      const comPdf = R.linhaItem(rd, { ...(it || { cod: pi.cod }), preco: pi.preco }, destino);
      const dPreco = hoje.preco - pi.preco, dSt = hoje.impostoCliente - ((pi.st || 0) + (pi.fcp || 0) + (pi.difal || 0));
      const status = !it ? 'saiu do mix' : Math.abs(dPreco) > 0.004 ? (dPreco > 0 ? 'preço subiu' : 'preço caiu') : Math.abs(dSt) > 0.004 ? 'imposto mudou' : 'igual';
      return { pi, it, hoje, comPdf, dPreco, dSt, status };
    });
    const novos = rd.itens.filter(i => !d.itens.some(x => x.cod === i.cod));
    const mudou = linhas.filter(l => l.status !== 'igual');
    const totHoje = linhas.reduce((s, l) => s + l.hoje.finalComSt * l.pi.qtd, 0);
    const lucroPdf = linhas.reduce((s, l) => s + (isNaN(l.comPdf.lucro) ? 0 : l.comPdf.lucro * l.pi.qtd), 0);
    const recPdf = linhas.reduce((s, l) => s + (l.comPdf.info.custo > 0 ? l.pi.preco * l.pi.qtd : 0), 0);
    saida.replaceChildren(
      card(rotulo(`${nome} · Nº ${d.numero} · ${d.data}`),
        h('div', { class: 'grande' }, mudou.length ? `${mudou.length} mudança${mudou.length > 1 ? 's' : ''}` : 'Nada mudou'),
        h('div', { class: 'heroi' }, h('div', { class: 'linha' }, `${d.rede.nome}${d.loja ? ' · ' + d.loja.razao : ''} · total no PDF ${moeda(d.totais.total)} · hoje seria ${moeda(totHoje)}`),
          h('div', { class: 'chips' }, chip(`Δ ${moeda(totHoje - d.totais.total)}`, totHoje > d.totais.total ? 'atencao' : 'ok'), chip(`Margem com os preços do PDF: ${recPdf ? pct(lucroPdf / recPdf) : '—'}`), novos.length ? chip(`${novos.length} item(ns) da rede fora do orçamento`, 'azul') : null)),
        h('div', { class: 'acoes' },
          botao('Reabrir com os preços do PDF', () => reabrirOrc(rd, d, true), 'primario'),
          botao('Reabrir com os preços de hoje', () => reabrirOrc(rd, d, false), 'secundario'),
          botao('Passar os preços do PDF para a rede', () => { if (!confirm('Gravar os preços do PDF como preços da rede?')) return; d.itens.forEach(pi => { const it = mix.get(pi.cod); if (it) it.preco = pi.preco; }); R.salvarRede(rd); toast('Preços da rede atualizados', 'ok'); mostrarDiff(d, nome); }, 'secundario'))),
      card(h('h2', {}, 'Item a item'), tabela([
        { titulo: 'Código', valor: (l) => h('b', {}, l.pi.cod) },
        { titulo: 'Produto', valor: (l) => String(l.it?.nome || l.hoje.info.descricao || '').slice(0, 32) },
        { titulo: 'Qtd', num: true, valor: (l) => l.pi.qtd },
        { titulo: 'Preço no PDF', num: true, valor: (l) => moeda(l.pi.preco) },
        { titulo: 'Preço hoje', num: true, valor: (l) => h('b', {}, moeda(l.hoje.preco)) },
        { titulo: 'ST/DIFAL no PDF', num: true, valor: (l) => moeda((l.pi.st || 0) + (l.pi.fcp || 0) + (l.pi.difal || 0)) },
        { titulo: 'ST/DIFAL hoje', num: true, valor: (l) => moeda(l.hoje.impostoCliente) },
        { titulo: 'Margem (PDF)', num: true, valor: (l) => isNaN(l.comPdf.margem) ? '—' : pct(l.comPdf.margem) },
        { titulo: 'Margem (hoje)', num: true, valor: (l) => isNaN(l.hoje.margem) ? '—' : pct(l.hoje.margem) },
        { titulo: 'O que mudou', valor: (l) => chip(l.status, l.status === 'igual' ? 'mini ok' : l.status === 'saiu do mix' ? 'mini erro' : 'mini atencao') }
      ], linhas, { classeLinha: (l) => l.status === 'igual' ? '' : l.status === 'saiu do mix' ? 'div' : 'alerta' })),
      novos.length ? card(h('h2', {}, 'Itens da rede que não estavam neste orçamento'), h('div', { class: 'lista' }, novos.slice(0, 20).map(i => h('div', { class: 'it' }, h('div', { class: 'ic azul' }, '+'), h('div', {}, h('b', {}, i.cod), h('span', {}, i.nome || '')))))) : null);
  }

  function reabrirOrc(rd, d, comPrecoPdf) {
    S.redeId = rd.id;
    S.orc = { ...novoOrc(rd), lojaCod: d.loja?.cod || '', vendedor: d.vendedor || '', condicao: d.condicao || '', validadeDias: d.validadeDias || 7, obs: d.obs || '', qtd: Object.fromEntries(d.itens.map(i => [i.cod, i.qtd])), precoPdf: comPrecoPdf ? Object.fromEntries(d.itens.map(i => [i.cod, i.preco])) : {}, origem: d.numero };
    S.aba = 'orcamento'; reabrir();
  }

  // Pedido do painel da Rede Sander: quantidades por código do cliente
  function mostrarSander(d, nome) {
    const rd = R.rede('sander') || R.redes().find(r => /sander/i.test(r.nome));
    if (!rd) return saida.replaceChildren(aviso('Não há a Rede Sander neste aparelho.', 'erro'));
    const qtd = {};
    for (const [cod, s] of Object.entries(d.state || {})) {
      const it = rd.itens.find(i => i.codCliente === cod || i.cod === cod);
      if (it && +s.qtdLoja > 0) qtd[it.cod] = +s.qtdLoja;
    }
    const loja = rd.lojas.find(l => l.cod === d.meta?.cliente);
    saida.replaceChildren(card(rotulo(`Pedido do painel · ${nome}`),
      h('div', { class: 'grande' }, `${Object.keys(qtd).length} itens com quantidade`),
      h('div', { class: 'heroi' }, h('div', { class: 'linha' }, `${loja ? loja.razao + ' · ' + loja.cidade : 'loja ' + (d.meta?.cliente || '—')} · ${d.meta?.data || ''}`)),
      h('div', { class: 'acoes' }, botao('Transformar em orçamento', () => {
        S.redeId = rd.id; S.orc = { ...novoOrc(rd), lojaCod: loja?.cod || '', vendedor: d.meta?.vendedor || '', qtd, origem: nome };
        S.aba = 'orcamento'; reabrir();
      }, 'primario'))));
  }

  return h('div', {}, card(h('h2', {}, 'Conferir o que mudou'), h('p', { class: 'desc' }, 'Jogue de novo o PDF de um orçamento feito pelo app: ele mostra o que mudou de preço, ST e mix para a rede, com a margem dos preços antigos e de hoje, e deixa reabrir para ajustar.'), zona), saida);
}

// ===================================================================== CUSTOS E REDES
function telaConfig(reabrir) {
  const info = R.custosInfo();
  const st = h('div');
  const inCsv = h('input', { type: 'file', accept: '.csv,.txt', style: { display: 'none' }, onchange: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    st.replaceChildren(carregando('Lendo o CSV…'));
    try { const { data } = await lerArquivo(f); const r = R.importarCustosCSV(M.decodificar(data), f.name); st.replaceChildren(aviso(`${r.total} produtos lidos · ${r.comCusto} com custo${r.cadastro ? ` · cadastro da calculadora atualizado (${r.cadastro})` : ''}.`, 'ok')); setTimeout(reabrir, 900); }
    catch (err) { st.replaceChildren(aviso(err.message, 'erro')); }
    e.target.value = '';
  } });
  const p = R.params();
  const inIcmsInt = h('input', { type: 'number', step: '0.1', value: p.icmsInterno, onchange: (e) => R.salvarParams({ icmsInterno: +e.target.value || 0 }) });
  const custosPadrao = h('div', { class: 'campos tres' }, p.custosVar.map((c, i) => campo(c.nome + ' %', h('input', { type: 'number', step: '0.1', value: c.pct, onchange: (e) => { const l = R.params().custosVar; l[i] = { ...l[i], pct: +e.target.value || 0 }; R.salvarParams({ custosVar: l }); } }))));

  const inNome = h('input', { type: 'text', placeholder: 'Nome da rede' });
  const inUf = select(UFS, 'SP');
  const listaRedes = h('div');
  const desenharRedes = () => listaRedes.replaceChildren(tabela([
    { titulo: 'Rede', valor: (r) => h('b', {}, r.nome) }, { titulo: 'UF', chave: 'uf' }, { titulo: 'Itens', num: true, valor: (r) => r.itens.length }, { titulo: 'Lojas', num: true, valor: (r) => r.lojas.length },
    { titulo: '', valor: (r) => h('div', { style: { display: 'flex', gap: '6px' } },
      botao('Lojas CSV', () => { const i = h('input', { type: 'file', accept: '.csv,.txt', onchange: async (e) => { try { const { data } = await lerArquivo(e.target.files[0]); r.lojas = R.importarLojasCSV(M.decodificar(data)); R.salvarRede(r); desenharRedes(); toast(`${r.lojas.length} lojas importadas`, 'ok'); } catch (err) { toast(err.message, 'erro'); } } }); i.click(); }, 'secundario pequeno'),
      botao('Copiar mix', () => { const c = { ...structuredClone(r), id: undefined, nome: r.nome + ' (cópia)' }; const n = R.criarRede(c.nome, c.uf); Object.assign(n, { ...c, id: n.id }); R.salvarRede(n); desenharRedes(); }, 'secundario pequeno'),
      botao('Excluir', () => { if (confirm(`Excluir a rede ${r.nome}?`)) { R.excluirRede(r.id); desenharRedes(); } }, 'perigo pequeno')) }
  ], R.redes()));
  desenharRedes();

  return h('div', {},
    card(h('h2', {}, 'Custos dos produtos'),
      h('p', { class: 'desc' }, 'Os custos do CSV de Produtos que você mandou já vêm no app (trancados por senha). Quando o sistema mudar, dá para atualizar com um CSV novo. O custo nunca vai para o PDF.'),
      info ? aviso(`${info.comCusto} de ${info.total} produtos com custo · ${info.arquivo || 'CSV'} · ${dataHora(new Date(info.quando))}`, 'ok') : cardSenha(reabrir),
      inCsv, botao('Atualizar com um CSV mais novo', () => inCsv.click(), 'secundario cheio'), st,
      info ? h('div', { class: 'acoes' }, botao('Trancar os custos neste aparelho', () => { R.bloquearCustos(); toast('Custos trancados'); reabrir(); }, 'secundario pequeno')) : null),
    card(h('h2', {}, 'Custos variáveis padrão (% do preço)'),
      h('p', { class: 'desc' }, 'Valem para todas as redes; cada rede pode mudar os seus na aba Margens. O ICMS próprio é automático: 4% importado, 7% ou 12% interestadual.'),
      custosPadrao, h('div', { style: { marginTop: '10px' } }, campo(`ICMS próprio em venda dentro do estado (${config.get().uf}) %`, inIcmsInt, 'PR: 19,5% com diferimento de 38,46% = 12% efetivo'))),
    card(h('h2', {}, 'Redes'), listaRedes,
      h('div', { class: 'campos', style: { marginTop: '12px' } }, campo('Nova rede', inNome), campo('UF principal', inUf)),
      h('div', { class: 'acoes' }, botao('Criar rede', () => { if (!inNome.value.trim()) return toast('Dê um nome', 'erro'); const r = R.criarRede(inNome.value.trim(), inUf.value); S.redeId = r.id; S.aba = 'margens'; reabrir(); }, 'secundario'))));
}
