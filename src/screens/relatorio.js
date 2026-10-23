// 7. Relatório de ICMS-ST (notas no Tributei) com totais por UF e por mês.
import { h, card, rotulo, chip, botao, carregando, mostrarErro, jsonBruto, tabela, moeda, moedaCurta, dataCurta, lerData, select, campo, exportarXlsx, carimbo, vazio } from '../ui.js';
import { api } from '../api.js';
import { config } from '../store.js';
import { UFS } from '../data.js';
import { listas, valorPorNome, num } from '../extrair.js';

const campoNota = (n) => ({
  id: valorPorNome(n, /^id$/),
  numero: valorPorNome(n, /^(nnf|numero|numeronota|nota)$/, /numero/),
  data: valorPorNome(n, /^(dhemi|demi|dataemissao|emissao|data)$/, /emissao|data/),
  uf: String(valorPorNome(n, /^(ufdest|estadodest|ufdestino|uf|estado)$/, /dest/) ?? '').toUpperCase(),
  nome: valorPorNome(n, /^(xnome|nome|destinatario|razaosocial|cliente)$/, /nome/),
  valorNota: num(valorPorNome(n, /^(vnf|valornota|valortotal|total)$/)),
  st: num(valorPorNome(n, /^(vst|vicmsst|valorst|icmsst|valoricmsst|totalst)$/, /icmsst|vst/)),
  status: valorPorNome(n, /^status$|situacao/)
});

export default {
  id: 'relatorio',
  titulo: 'Relatório de ICMS-ST',
  subtitulo: 'Notas no Tributei, por UF e por mês',
  resumo: 'Total de ST do ano por estado e por mês, para bater com a apuração',
  icone: 'relatorio', cor: 'azul', largo: true,
  async render(el) {
    const c = config.get();
    const inAno = h('input', { type: 'number', value: c.ano });
    const inOrigem = select([['saidas', 'Saídas · ICMS-ST'], ['entrada-icmsst', 'Entradas · ICMS-ST'], ['entrada-difal', 'Entradas · DIFAL']], 'saidas');
    const inUf = select(UFS, c.uf);
    const area = h('div');

    const carregar = async () => {
      area.replaceChildren(card(carregando()));
      try {
        const [base, tipo] = inOrigem.value.split('-');
        const r = base === 'saidas' ? await api.icmsstSaida(inAno.value, inUf.value) : await api.nfesEntrada(inAno.value, inUf.value, tipo);
        const l = listas(r)[0];
        mostrar((l ? l.itens : []).map(n => ({ ...campoNota(n), bruto: n })), r);
      } catch (e) { const k = card(); mostrarErro(k, e); area.replaceChildren(k); }
    };

    function mostrar(notas, bruto) {
      const totalSt = notas.reduce((s, n) => s + (isNaN(n.st) ? 0 : n.st), 0);
      const totalNf = notas.reduce((s, n) => s + (isNaN(n.valorNota) ? 0 : n.valorNota), 0);
      const porUf = {}; const porMes = {};
      for (const n of notas) {
        const uf = n.uf || '—'; porUf[uf] = (porUf[uf] || 0) + (n.st || 0);
        const d = lerData(n.data); const mes = isNaN(d) ? '—' : `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        porMes[mes] = (porMes[mes] || 0) + (n.st || 0);
      }
      const ufsOrd = Object.entries(porUf).sort((a, b) => b[1] - a[1]);
      const maior = ufsOrd[0];
      const max = maior?.[1] || 1;
      area.replaceChildren(
        card(rotulo(`ICMS-ST ${inAno.value}`), h('div', { class: 'grande' }, moeda(totalSt)),
          h('div', { class: 'heroi' }, h('div', { class: 'linha' }, `${notas.length} nota${notas.length === 1 ? '' : 's'} · ${moedaCurta(totalNf)} em notas`),
            h('div', { class: 'chips' }, maior ? chip(`Maior: ${maior[0]} · ${moedaCurta(maior[1])}`, 'rosa') : null, chip(`${ufsOrd.length} UF${ufsOrd.length === 1 ? '' : 's'}`)))),
        notas.length ? card(h('h2', {}, 'ST por estado'),
          h('div', { class: 'barras' }, ufsOrd.slice(0, 12).map(([uf, v], i) => h('div', { class: 'barra-l' },
            h('b', {}, uf), h('div', { class: 'trilho' }, h('i', { style: { width: (v / max * 100) + '%', opacity: i === 0 ? 1 : .55 } })), h('span', {}, moedaCurta(v)))))) : null,
        notas.length ? card(h('h2', {}, 'ST por mês'), tabela([{ titulo: 'Mês', valor: (m) => m[0] }, { titulo: 'ICMS-ST', num: true, valor: (m) => moeda(m[1]) }], Object.entries(porMes).sort())) : null,
        card(h('h2', {}, 'Notas'), notas.length ? tabela([
          { titulo: 'ID', chave: 'id' }, { titulo: 'Nota', chave: 'numero' }, { titulo: 'Data', valor: (n) => n.data ? dataCurta(n.data) : '—' },
          { titulo: 'UF', chave: 'uf' }, { titulo: 'Cliente', valor: (n) => String(n.nome ?? '—').slice(0, 30) },
          { titulo: 'Valor', num: true, valor: (n) => moeda(n.valorNota) }, { titulo: 'ICMS-ST', num: true, valor: (n) => moeda(n.st) }
        ], notas) : vazio('Nenhuma nota', 'Não há notas neste filtro.'),
          h('div', { class: 'acoes' }, notas.length ? botao('Exportar planilha', () => exportarXlsx(`Relatorio-ST_${inAno.value}_${carimbo()}.xlsx`, [
            { nome: 'Notas', linhas: [['ID', 'Nota', 'Data', 'UF', 'Cliente', 'Valor nota', 'ICMS-ST'], ...notas.map(n => [n.id, n.numero, n.data ? dataCurta(n.data) : '', n.uf, n.nome, n.valorNota, n.st])] },
            { nome: 'Por UF', linhas: [['UF', 'ICMS-ST'], ...ufsOrd] },
            { nome: 'Por mês', linhas: [['Mês', 'ICMS-ST'], ...Object.entries(porMes).sort()] }
          ]), 'secundario') : null),
          jsonBruto(bruto)));
    }

    el.append(card(h('div', { class: 'campos tres' }, campo('Ano', inAno), campo('Notas', inOrigem), campo('UF da empresa', inUf)),
      h('div', { class: 'acoes' }, botao('Carregar relatório', carregar, 'primario cheio'))), area);
  }
};
