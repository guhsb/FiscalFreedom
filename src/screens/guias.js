// 6. Guias de ICMS-ST e DIFAL (saídas e entradas).
import { h, card, rotulo, chip, botao, aviso, carregando, mostrarErro, jsonBruto, tabela, moeda, dataCurta, select, campo, toast, vazio } from '../ui.js';
import { api } from '../api.js';
import { config } from '../store.js';
import { UFS, TIPOS_GUIA, STATUS_GUIA_ENTRADA, STATUS_GUIA_SAIDA } from '../data.js';
import { listas, valorPorNome, num } from '../extrair.js';

const campoGuia = (g) => ({
  id: valorPorNome(g, /^id$/, /idguia|guiaid/),
  uf: valorPorNome(g, /^(uf|estado)$/, /ufguia|estadoguia/),
  tipo: valorPorNome(g, /tipoguia|^tipo$/),
  valor: num(valorPorNome(g, /^(valor|valortotal|vtotal|total)$/, /valorguia|valor/)),
  venc: valorPorNome(g, /vencimento|datavenc|dtvenc/),
  comp: valorPorNome(g, /competencia|mesano|periodo/),
  nota: valorPorNome(g, /numeronota|nnf|nota$|numero$/),
  status: valorPorNome(g, /^status$|situacao/)
});

export default {
  id: 'guias',
  titulo: 'Guias',
  subtitulo: 'ICMS-ST e DIFAL pelo Tributei',
  resumo: 'Lista, emite e arquiva guias de ST e DIFAL, de saída e de entrada',
  icone: 'guia', cor: 'rosa', largo: true,
  async render(el) {
    let base = 'saidas';
    let status = 'Pendentes';
    const sel = new Set();
    const abasBase = h('div', { class: 'abas' });
    const abasStatus = h('div', { class: 'abas' });
    const area = h('div');
    const extra = h('div');

    const desenharAbas = () => {
      abasBase.replaceChildren(...[['saidas', 'Saídas'], ['entrada', 'Entradas']].map(([v, t]) => h('button', { class: base === v ? 'on' : '', onclick: () => { base = v; status = 'Pendentes'; desenharAbas(); carregar(); } }, t)));
      const sts = base === 'saidas' ? STATUS_GUIA_SAIDA : STATUS_GUIA_ENTRADA;
      abasStatus.replaceChildren(...sts.map(s => h('button', { class: status === s ? 'on' : '', onclick: () => { status = s; desenharAbas(); carregar(); } }, s)));
      extra.replaceChildren(base === 'saidas' ? formAreaGuia() : formCriarGuia());
    };

    async function carregar() {
      sel.clear();
      area.replaceChildren(card(carregando()));
      try {
        const r = await api.guias(base, status);
        const l = listas(r)[0];
        const itens = l ? l.itens : [];
        desenharLista(itens, r);
      } catch (e) { const c = card(); mostrarErro(c, e); area.replaceChildren(c); }
    }

    function desenharLista(itens, bruto) {
      const gs = itens.map(g => ({ ...campoGuia(g), bruto: g }));
      const total = gs.reduce((s, g) => s + (isNaN(g.valor) ? 0 : g.valor), 0);
      const acoes = h('div', { class: 'acoes' },
        status === 'Pendentes' || status === 'Rejeitadas' ? botao('Emitir selecionadas', () => agir('emitir'), 'primario') : null,
        status !== 'Arquivadas' ? botao('Arquivar selecionadas', () => agir('arquivar'), 'secundario') : botao('Desarquivar selecionadas', () => agir('arquivar'), 'secundario'),
        botao('Atualizar', carregar, 'secundario'));
      area.replaceChildren(
        card(rotulo(`${base === 'saidas' ? 'Saídas' : 'Entradas'} · ${status}`),
          h('div', { class: 'grande' }, moeda(total)),
          h('div', { class: 'heroi' }, h('div', { class: 'linha' }, `${gs.length} guia${gs.length === 1 ? '' : 's'}`)), acoes),
        card(gs.length ? tabela([
          { titulo: '', valor: (g) => h('input', { type: 'checkbox', class: 'sel', checked: sel.has(g.id), onchange: (e) => e.target.checked ? sel.add(g.id) : sel.delete(g.id) }) },
          { titulo: 'ID', valor: (g) => h('b', {}, g.id ?? '—') },
          { titulo: 'UF', valor: (g) => g.uf ?? '—' },
          { titulo: 'Tipo', valor: (g) => g.tipo ?? '—' },
          { titulo: 'Nota', valor: (g) => g.nota ?? '—' },
          { titulo: 'Competência', valor: (g) => g.comp ?? '—' },
          { titulo: 'Vencimento', valor: (g) => g.venc ? dataCurta(g.venc) : '—' },
          { titulo: 'Valor', num: true, valor: (g) => moeda(g.valor) }
        ], gs) : vazio('Nenhuma guia', `Sem guias ${status.toLowerCase()} em ${base === 'saidas' ? 'saídas' : 'entradas'}.`),
        jsonBruto(bruto)));
    }

    async function agir(acao) {
      const ids = [...sel].filter(x => x !== undefined && x !== null);
      if (!ids.length) return toast('Selecione pelo menos uma guia', 'erro');
      const ok = confirm(acao === 'emitir' ? `Emitir ${ids.length} guia(s) no Tributei?` : `Arquivar/desarquivar ${ids.length} guia(s)?`);
      if (!ok) return;
      try {
        if (acao === 'emitir') await api.emitirGuias(base, ids);
        else for (const id of ids) await api.arquivarGuia(base, id);
        toast('Pronto', 'ok'); carregar();
      } catch (e) { toast(e.message, 'erro'); }
    }

    function formAreaGuia() {
      const inUf = select(UFS, 'MT'); const inTipo = select(TIPOS_GUIA, 'G-ICMS-ST');
      const inIds = h('input', { type: 'text', placeholder: 'Ex.: 1532, 1533' });
      const res = h('div');
      return card(h('h2', {}, 'Mandar notas para a área de guias'),
        h('p', { class: 'desc' }, 'Use os IDs das notas que aparecem no Relatório de ICMS-ST (coluna ID).'),
        h('div', { class: 'campos tres' }, campo('UF', inUf), campo('Tipo de guia', inTipo), campo('IDs das notas', inIds)),
        h('div', { class: 'acoes' }, botao('Enviar', async () => {
          const ids = inIds.value.split(/[,\s;]+/).filter(Boolean);
          if (!ids.length) return toast('Informe os IDs', 'erro');
          res.replaceChildren(carregando('Enviando…'));
          try { const r = await api.enviarAreaGuia(inUf.value, inTipo.value, ids); res.replaceChildren(aviso('Notas enviadas. Veja em Pendentes.', 'ok'), jsonBruto(r)); }
          catch (e) { mostrarErro(res, e); }
        })), res);
    }

    function formCriarGuia() {
      const c = config.get();
      const inAno = h('input', { type: 'number', value: c.ano }); const inUf = select(UFS, c.uf);
      const inId = h('input', { type: 'text', placeholder: 'ID da nota' }); const inTipo = select(TIPOS_GUIA, 'G-ICMS-ST');
      const res = h('div');
      return card(h('h2', {}, 'Criar guia de uma nota de entrada'),
        h('div', { class: 'campos' }, campo('Ano', inAno), campo('UF', inUf), campo('ID da nota', inId), campo('Tipo', inTipo)),
        h('div', { class: 'acoes' }, botao('Criar guia', async () => {
          if (!inId.value.trim()) return toast('Informe o ID da nota', 'erro');
          res.replaceChildren(carregando('Criando…'));
          try { const r = await api.criarGuiaEntrada(inAno.value, inUf.value, inId.value.trim(), inTipo.value); res.replaceChildren(aviso('Guia criada.', 'ok'), jsonBruto(r)); }
          catch (e) { mostrarErro(res, e); }
        })), res);
    }

    el.append(abasBase, abasStatus, area, extra);
    desenharAbas();
    carregar();
  }
};
