// Base das telas 4 (notas de saída) e 5 (notas de entrada).
import { h, card, rotulo, chip, botao, aviso, carregando, mostrarErro, jsonBruto, tabela, tabelaAuto, moeda, dataCurta, lerArquivo, exportarXlsx, carimbo, toast } from '../ui.js';
import { api } from '../api.js';
import { config, dados } from '../store.js';
import { categoriaPorNcm, FILIAIS } from '../data.js';
import { lerNfe } from '../xml.js';
import { listas } from '../extrair.js';

// Conferência local de uma nota de saída (sem internet)
export function conferirSaida(nfe) {
  const cst = dados.cstSistema();
  const sim = dados.ultimaSimulacao();
  const uf = nfe.destinatario.uf;
  const achados = [];
  if (!nfe.destinatario.contribuinte) {
    achados.push({ tipo: 'azul', titulo: 'Cliente não contribuinte', texto: 'Venda a consumidor final: entra DIFAL, não ICMS-ST. Use o cálculo de DIFAL do Tributei.' });
    return achados;
  }
  for (const it of nfe.itens) {
    const cat = categoriaPorNcm(it.ncm);
    if (!cat) { achados.push({ tipo: 'atencao', titulo: `Item ${it.item} · NCM ${it.ncm}`, texto: 'NCM fora das 4 categorias cadastradas no app. Confira no Tributei.' }); continue; }
    const esperado = cst[uf]?.[cat.id];
    if (esperado && it.cstCompleto !== esperado) {
      achados.push({ tipo: 'erro', titulo: `Item ${it.item} · ${it.descricao.slice(0, 40)}`, texto: `CST na nota ${it.cstCompleto}, no cadastro para ${uf} é ${esperado}.` });
    }
    const r = sim?.porUf?.[uf]?.[cat.id];
    const deveTerSt = r ? (r.temSt && !FILIAIS.includes(uf)) : esperado === '210';
    if (deveTerSt && !it.vSt) achados.push({ tipo: 'erro', titulo: `Item ${it.item} · sem ST`, texto: `${cat.nome} para ${uf} tem ST pelo fornecedor e a nota não destacou.` });
    if (!deveTerSt && it.vSt > 0) achados.push({ tipo: 'erro', titulo: `Item ${it.item} · ST indevida`, texto: `${cat.nome} para ${uf} não tem ST pela Freedom, mas a nota destacou ${moeda(it.vSt)}.` });
    if (deveTerSt && it.vSt > 0 && r?.pctSt) {
      const calc = it.valor * r.pctSt;
      const dif = it.vSt - calc;
      if (Math.abs(dif) > Math.max(0.05, calc * 0.02)) {
        achados.push({ tipo: 'atencao', titulo: `Item ${it.item} · valor do ST`, texto: `Nota ${moeda(it.vSt)} · simulação ${moeda(calc)} (diferença ${moeda(dif)}). Pode ser frete, IPI ou desconto na base; confira no cálculo do Tributei.` });
      }
    }
  }
  if (!achados.length) achados.push({ tipo: 'ok', titulo: 'Nota conferida', texto: 'CST e ST de todos os itens batem com o cadastro e a última simulação.' });
  return achados;
}

export function conferirEntrada(nfe) {
  const ufEmp = config.get().uf;
  const achados = [];
  const interestadual = nfe.emitente.uf && nfe.emitente.uf !== ufEmp;
  for (const it of nfe.itens) {
    if (it.vSt > 0) continue; // ST destacada pelo fornecedor
    if (it.cst === '60' || it.cst === '500') { achados.push({ tipo: 'ok', titulo: `Item ${it.item} · ST já retida`, texto: 'ICMS cobrado anteriormente por ST.' }); continue; }
    const cat = categoriaPorNcm(it.ncm);
    if (interestadual && cat && cat.cest && !it.vSt) {
      achados.push({ tipo: 'atencao', titulo: `Item ${it.item} · ${it.descricao.slice(0, 40)}`, texto: `Compra de ${nfe.emitente.uf} sem ST destacada (${cat.nome}). Confira no Tributei se cabe antecipação/ST na entrada em ${ufEmp}.` });
    }
  }
  if (!achados.length) achados.push({ tipo: 'ok', titulo: 'Nada fora do comum', texto: interestadual ? 'Itens com ST destacada ou sem CEST.' : 'Compra dentro do estado.' });
  return achados;
}

function listaAchados(achados) {
  const ic = { erro: '✕', atencao: '!', ok: '✓', azul: 'i' };
  return h('div', { class: 'lista' }, achados.slice(0, 30).map(a => h('div', { class: 'it' },
    h('div', { class: 'ic ' + a.tipo }, ic[a.tipo]), h('div', {}, h('b', {}, a.titulo), h('span', {}, a.texto)))));
}

export function telaNotas({ id, titulo, subtitulo, resumo, icone, cor, base, conferir }) {
  return {
    id, titulo, subtitulo, resumo, icone, cor, largo: true,
    async render(el) {
      const notas = []; // { arquivo, nfe, achados, saida }
      const inDifal = h('input', { type: 'checkbox' });
      const inFile = h('input', { type: 'file', accept: '.xml,text/xml,application/xml', multiple: true, onchange: (e) => adicionar([...e.target.files]) });
      const zona = h('label', { class: 'arquivo' }, inFile, h('b', {}, 'Escolher XML das notas'), h('span', {}, 'Pode selecionar vários de uma vez'), h('span', { class: 'muted' }, 'No PC também dá para arrastar os arquivos aqui'));
      zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('arrasta'); });
      zona.addEventListener('dragleave', () => zona.classList.remove('arrasta'));
      zona.addEventListener('drop', (e) => { e.preventDefault(); zona.classList.remove('arrasta'); adicionar([...e.dataTransfer.files].filter(f => /\.xml$/i.test(f.name))); });
      const resumoBox = h('div');
      const lista = h('div');

      async function adicionar(files) {
        for (const f of files) {
          try {
            const arquivo = await lerArquivo(f);
            const nfe = lerNfe(arquivo.texto);
            const n = { arquivo, nfe, achados: conferir(nfe), saida: h('div') };
            notas.push(n);
          } catch (e) { toast(`${f.name}: ${e.message}`, 'erro'); }
        }
        inFile.value = '';
        desenhar();
      }

      function desenhar() {
        const erros = notas.reduce((s, n) => s + n.achados.filter(a => a.tipo === 'erro').length, 0);
        resumoBox.replaceChildren(notas.length ? card(rotulo('Conferência local'),
          h('div', { class: 'grande' }, erros ? `${erros} problema${erros > 1 ? 's' : ''}` : 'Sem problemas'),
          h('div', { class: 'heroi' }, h('div', { class: 'linha' }, `${notas.length} nota${notas.length > 1 ? 's' : ''} · ST destacada ${moeda(notas.reduce((s, n) => s + n.nfe.totais.st, 0))}`),
            h('div', { class: 'acoes' },
              botao('Calcular todas no Tributei', async () => { for (const n of notas) await calcular(n); }, 'primario'),
              botao('Exportar conferência', exportar, 'secundario'),
              botao('Limpar', () => { notas.length = 0; desenhar(); }, 'secundario')))) : null);
        lista.replaceChildren(...notas.map(n => cartaoNota(n)));
      }

      function cartaoNota(n) {
        const { nfe } = n;
        return card(
          h('div', { class: 'nota-cab' },
            h('div', {}, h('b', {}, `NF ${nfe.numero} · série ${nfe.serie}`),
              h('div', { class: 'muted' }, `${dataCurta(nfe.emissao)} · ${base === 'saidas' ? nfe.destinatario.nome + ' · ' + nfe.destinatario.uf : nfe.emitente.nome + ' · ' + nfe.emitente.uf}`)),
            h('div', { class: 'chips' }, chip(moeda(nfe.totais.nota)), nfe.totais.st ? chip('ST ' + moeda(nfe.totais.st), 'rosa') : chip('sem ST'))),
          rotulo('Conferência'), listaAchados(n.achados),
          rotulo('Itens'),
          tabela([
            { titulo: '#', chave: 'item' }, { titulo: 'Produto', valor: (i) => i.descricao.slice(0, 38) }, { titulo: 'NCM', chave: 'ncm' }, { titulo: 'CEST', chave: 'cest' },
            { titulo: 'CFOP', chave: 'cfop' }, { titulo: 'CST', chave: 'cstCompleto' }, { titulo: 'Valor', num: true, valor: (i) => moeda(i.valor) },
            { titulo: 'MVA', num: true, valor: (i) => i.mva ? i.mva.toLocaleString('pt-BR') + '%' : '—' }, { titulo: 'BC ST', num: true, valor: (i) => i.bcSt ? moeda(i.bcSt) : '—' }, { titulo: 'ICMS-ST', num: true, valor: (i) => i.vSt ? moeda(i.vSt) : '—' }
          ], nfe.itens),
          h('div', { class: 'acoes' },
            botao('Calcular no Tributei', () => calcular(n), 'secundario'),
            botao('Salvar no Tributei', () => salvarNoTributei(n), 'secundario')),
          n.saida);
      }

      async function calcular(n) {
        n.saida.replaceChildren(carregando());
        try {
          const r = await api.calcularXml(base, n.arquivo, inDifal.checked, n.nfe.destinatario.uf === 'MT' ?{ cliente_atuacao: config.get().regraMT } : {});
          n.resposta = r;
          const ls = listas(r);
          n.saida.replaceChildren(aviso('Cálculo do Tributei recebido (nada foi salvo na sua conta).', 'ok'),
            ls[0] ? tabelaAuto(ls[0].itens) : null, jsonBruto(r));
        } catch (e) { mostrarErro(n.saida, e); }
      }

      async function salvarNoTributei(n) {
        n.saida.replaceChildren(carregando('Enviando a nota…'));
        try {
          const r = await api.enviarXml(base, n.arquivo, inDifal.checked);
          n.saida.replaceChildren(aviso('Nota enviada ao Tributei. Ela aparece em Guias e no Relatório.', 'ok'), jsonBruto(r));
        } catch (e) { mostrarErro(n.saida, e); }
      }

      function exportar() {
        exportarXlsx(`Conferencia-${base}_${carimbo()}.xlsx`, [
          { nome: 'Achados', linhas: [['Nota', 'Série', 'UF', 'Tipo', 'Item', 'Detalhe'], ...notas.flatMap(n => n.achados.map(a => [n.nfe.numero, n.nfe.serie, base === 'saidas' ? n.nfe.destinatario.uf : n.nfe.emitente.uf, { erro: 'Erro', atencao: 'Atenção', ok: 'OK', azul: 'Info' }[a.tipo], a.titulo, a.texto]))] },
          { nome: 'Itens', linhas: [['Nota', 'Item', 'Código', 'Produto', 'NCM', 'CEST', 'CFOP', 'CST', 'Valor', 'MVA %', 'BC ST', 'ICMS-ST'], ...notas.flatMap(n => n.nfe.itens.map(i => [n.nfe.numero, i.item, i.codigo, i.descricao, i.ncm, i.cest, i.cfop, i.cstCompleto, i.valor, i.mva, i.bcSt, i.vSt]))] }
        ]);
      }

      el.append(
        card(h('h2', {}, 'Notas fiscais (XML)'),
          h('p', { class: 'desc' }, base === 'saidas'
            ? 'O app confere CST e ST de cada item com o cadastro do sistema e a última simulação, sem internet. Depois você pode pedir o cálculo oficial ao Tributei.'
            : 'O app lista os itens e aponta compras de fora do estado sem ST destacada. O cálculo de ST/DIFAL da entrada vem do Tributei.'),
          zona,
          h('label', { class: 'check', style: { marginTop: '12px' } }, inDifal, 'Calcular como DIFAL (cliente não contribuinte / uso e consumo)')),
        resumoBox, lista);
    }
  };
}
