// 3. Tabela de preços por UF: custo + ICMS-ST (sem IPI, como na ficha).
import * as XLSX from 'xlsx';
import { h, card, rotulo, chip, botao, aviso, tabela, exportarXlsx, carimbo, moeda, pctFmt, dataHora, select, campo, lerArquivo, toast } from '../ui.js';
import { dados, config } from '../store.js';
import { UFS, CATEGORIAS, FILIAIS, categoriaPorCest, categoriaPorNcm } from '../data.js';

export function precoFinal(prod, uf, sim) {
  const r = sim?.porUf?.[uf]?.[prod.cat];
  const st = r && r.temSt && !r.filial && !FILIAIS.includes(uf) ? prod.custo * (r.pctSt || 0) : 0;
  return { st, final: prod.custo + st, r };
}

export default {
  id: 'precos',
  titulo: 'Tabela de preços por UF',
  subtitulo: 'Custo + ICMS-ST em cada estado',
  resumo: 'Preço final com ST de cada produto em cada estado, pronto para o comercial',
  icone: 'preco', cor: 'verde', largo: true,
  async render(el) {
    const sim = dados.ultimaSimulacao();
    let produtos = dados.produtos();
    const c = config.get();
    const ufsSim = sim ? Object.keys(sim.porUf) : [];
    const inUf = select(UFS.map(u => [u, u + (ufsSim.includes(u) ? '' : ' · sem simulação')]), ufsSim.find(u => u === 'MT') || ufsSim[0] || 'MT');
    const inBusca = h('input', { type: 'search', placeholder: 'Buscar produto ou referência' });
    const area = h('div');

    const desenhar = () => {
      const uf = inUf.value; const q = inBusca.value.trim().toUpperCase();
      const lista = produtos.filter(p => !q || p.nome.toUpperCase().includes(q) || p.ref.toUpperCase().includes(q));
      const comSt = lista.filter(p => precoFinal(p, uf, sim).st > 0).length;
      area.replaceChildren(
        card(rotulo(`Preços para ${uf}`),
          h('div', { class: 'grande' }, comSt ? `${comSt} produto${comSt > 1 ? 's' : ''} com ST` : 'Sem ST'),
          h('div', { class: 'heroi' }, h('div', { class: 'linha' }, FILIAIS.includes(uf) ? 'Filial: vende de dentro do estado, sem ST.' : sim ? `Base: simulação de ${dataHora(new Date(sim.quando))}` : 'Rode o simulador para calcular o ST.'),
            h('div', { class: 'chips' }, CATEGORIAS.map(k => { const r = sim?.porUf?.[uf]?.[k.id]; return chip(`${k.nome}: ${r?.temSt && !FILIAIS.includes(uf) ? '+' + pctFmt(r.pctSt) : 'sem ST'}`, r?.temSt && !FILIAIS.includes(uf) ? 'rosa' : ''); })))),
        card(tabela([
          { titulo: 'Ref.', valor: (p) => h('b', {}, p.ref) },
          { titulo: 'Produto', valor: (p) => p.nome },
          { titulo: 'Custo', num: true, valor: (p) => h('input', { type: 'number', step: '0.01', value: p.custo, style: { width: '96px', textAlign: 'right' }, onchange: (e) => { p.custo = Number(e.target.value) || 0; dados.salvarProdutos(produtos); desenhar(); } }) },
          { titulo: 'ICMS-ST', num: true, valor: (p) => { const v = precoFinal(p, uf, sim).st; return v ? moeda(v) : '—'; } },
          { titulo: 'Valor final', num: true, valor: (p) => h('b', {}, moeda(precoFinal(p, uf, sim).final)) },
          { titulo: '', valor: (p) => h('button', { class: 'botao perigo pequeno', title: 'Remover', onclick: () => { produtos = produtos.filter(x => x !== p); dados.salvarProdutos(produtos); desenhar(); } }, '✕') }
        ], lista, { vazioTxt: 'Nenhum produto.' })));
    };

    const exportarTudo = () => {
      const ufs = UFS;
      exportarXlsx(`Precos-por-UF_${carimbo()}.xlsx`, [
        { nome: 'Valor final', linhas: [['Ref.', 'Produto', 'NCM', 'Custo s/ imposto', ...ufs], ...produtos.map(p => [p.ref, p.nome, CATEGORIAS.find(k => k.id === p.cat)?.ncm, p.custo, ...ufs.map(uf => +precoFinal(p, uf, sim).final.toFixed(2))])] },
        { nome: 'ICMS-ST', linhas: [['Ref.', 'Produto', ...ufs], ...produtos.map(p => [p.ref, p.nome, ...ufs.map(uf => +precoFinal(p, uf, sim).st.toFixed(2))])] }
      ]);
    };

    const importarFicha = async (file) => {
      try {
        const { data } = await lerArquivo(file);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets['CADASTRO'] || wb.Sheets[wb.SheetNames[0]];
        const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
        const novos = [];
        for (const l of linhas.slice(12)) {
          const nome = l[0], ref = l[4], ncm = l[8], cest = l[9], custo = Number(l[29]);
          if (!nome || !ref || isNaN(custo)) continue;
          const cat = (categoriaPorCest(cest) || categoriaPorNcm(ncm) || (String(cest).trim() === '-' ? CATEGORIAS[3] : null))?.id;
          if (!cat) continue;
          novos.push({ ref: String(ref), nome: String(nome).replace(/\s+CABLE BOX$/i, ''), cat, custo, importado: true });
        }
        if (!novos.length) return toast('Não achei produtos na aba CADASTRO', 'erro');
        produtos = novos; dados.salvarProdutos(produtos); desenhar(); toast(`${novos.length} produtos importados`, 'ok');
      } catch (e) { toast('Erro ao ler a ficha: ' + e.message, 'erro'); }
    };
    const inFicha = h('input', { type: 'file', accept: '.xlsx,.xls', style: { display: 'none' }, onchange: (e) => e.target.files[0] && importarFicha(e.target.files[0]) });

    const nRef = h('input', { type: 'text', placeholder: 'Ex.: CBT1003' });
    const nNome = h('input', { type: 'text', placeholder: 'Descrição' });
    const nCat = select(CATEGORIAS.map(k => [k.id, `${k.nome} (${k.ncm})`]), 'cabos');
    const nCusto = h('input', { type: 'number', step: '0.01', placeholder: '0,00' });
    const formNovo = h('div', { hidden: true, style: { marginTop: '12px' } },
      h('div', { class: 'campos' }, campo('Referência', nRef), campo('Custo s/ imposto', nCusto), campo('Descrição', nNome), campo('Tipo', nCat)),
      h('div', { class: 'acoes' }, botao('Adicionar', () => {
        if (!nRef.value.trim()) return toast('Informe a referência', 'erro');
        produtos = [...produtos, { ref: nRef.value.trim().toUpperCase(), nome: (nNome.value || nRef.value).trim().toUpperCase(), cat: nCat.value, custo: Number(nCusto.value) || 0, importado: true }];
        dados.salvarProdutos(produtos); nRef.value = nNome.value = nCusto.value = ''; formNovo.hidden = true; desenhar(); toast('Produto adicionado', 'ok');
      })));

    inUf.onchange = desenhar; inBusca.oninput = desenhar;
    el.append(
      sim ? null : aviso(h('span', {}, 'Sem simulação: os preços saem sem ST. ', h('a', { href: '#/simulador', style: { color: 'inherit', fontWeight: 700 } }, 'Simular agora')), 'info'),
      card(h('div', { class: 'campos' }, campo('Estado', inUf), campo('Buscar', inBusca)),
        h('div', { class: 'acoes' },
          botao('Exportar todas as UFs', exportarTudo, 'secundario'),
          botao('Importar ficha (.xlsx)', () => inFicha.click(), 'secundario'),
          botao('+ Produto', () => { formNovo.hidden = !formNovo.hidden; }, 'secundario')),
        inFicha, formNovo),
      area,
      h('div', { class: 'rodape' }, `Valor final = custo + ICMS-ST (IPI fora). Origem ${c.uf}.`));
    desenhar();
  }
};
