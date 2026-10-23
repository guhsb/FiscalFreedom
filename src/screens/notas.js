// Base das telas 4 (notas de saída) e 5 (notas de entrada).
import { h, card, rotulo, chip, botao, aviso, carregando, mostrarErro, jsonBruto, tabela, tabelaAuto, moeda, pctFmt, dataCurta, lerArquivo, exportarXlsx, carimbo, toast } from '../ui.js';
import { api } from '../api.js';
import { config, dados } from '../store.js';
import { categoriaPorNcm, FILIAIS } from '../data.js';
import { lerNfe } from '../xml.js';
import { listas, linhasSimulacao, temStFornecedor } from '../extrair.js';
import { tem } from '../acessos.js';
import { fmtNcm, fmtCest } from '../data.js';
import { calcularSt } from '../calc.js';

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
            tem(base === 'saidas' ? 'calculoSaida' : 'calculoEntrada') === false ? null : botao('Calcular XML no Tributei', () => calcular(n), 'secundario'),
            botao('Conferir item a item (simulação rápida)', () => simularItens(n), 'secundario'),
            tem(base === 'saidas' ? 'calculoSaida' : 'calculoEntrada') === false ? null : botao('Salvar no Tributei', () => salvarNoTributei(n), 'secundario')),
          n.saida);
      }

      async function calcular(n) {
        const recurso = base === 'saidas' ? 'calculoSaida' : 'calculoEntrada';
        if (tem(recurso) === false) return simularItens(n);
        n.saida.replaceChildren(carregando());
        try {
          const r = await api.calcularXml(base, n.arquivo, inDifal.checked, n.nfe.destinatario.uf === 'MT' ? { cliente_atuacao: config.get().regraMT } : {});
          n.resposta = r;
          const ls = listas(r);
          n.saida.replaceChildren(aviso('Cálculo do Tributei recebido (nada foi salvo na sua conta).', 'ok'),
            ls[0] ? tabelaAuto(ls[0].itens) : null, jsonBruto(r));
        } catch (e) {
          if (e.status === 401 || e.status === 403 || e.status === 404) return simularItens(n);
          mostrarErro(n.saida, e);
        }
      }

      // Recalcula cada item da nota pela Simulação rápida (serve para chaves só com o simulador)
      async function simularItens(n) {
        const { nfe } = n; const c = config.get();
        const saidaNota = base === 'saidas';
        const origem = saidaNota ? (nfe.emitente.uf || c.uf) : nfe.emitente.uf;
        const destino = saidaNota ? nfe.destinatario.uf : (nfe.destinatario.uf || c.uf);
        const difal = inDifal.checked || (saidaNota && !nfe.destinatario.contribuinte);
        const linhas = [];
        for (const [i, it] of nfe.itens.entries()) {
          n.saida.replaceChildren(carregando(`Simulação rápida: item ${i + 1} de ${nfe.itens.length}…`));
          const corpo = {
            tipoOperacao: saidaNota ? 'venda' : 'compra', tipoCalculo: difal ? 'difal' : 'icmsst',
            destinatario_simples: '2', simples: '2', estado_emit: [origem], estado_dest: [destino],
            importado: it.importado, ncm: fmtNcm(it.ncm), cest: fmtCest(it.cest),
            quantidade: Math.max(1, Math.round(it.qtd) || 1), vUnit: +(it.valor / (Math.max(1, Math.round(it.qtd) || 1))).toFixed(4),
            vFrete: it.vFrete, vSeg: it.vSeg, IPI: it.vIpi, cOutro: it.vOutro, vDescIC: it.vDesc
          };
          if (destino === 'MT' || origem === 'MT') corpo.cliente_atuacao = c.regraMT;
          const loc = calcularSt({ ncm: it.ncm, origem, destino, importado: it.importado, valores: { vProd: it.valor, vFrete: it.vFrete, vSeg: it.vSeg, IPI: it.vIpi, cOutro: it.vOutro, vDescIC: it.vDesc } });
          try {
            const r = await api.simulacao(corpo);
            const l = linhasSimulacao(r).find(x => x.uf === destino);
            const esperado = l ? (difal ? (l.difal || 0) : (temStFornecedor(l) ? l.valorSt || 0 : 0)) : NaN;
            linhas.push({ it, l, loc, esperado, fonte: 'Tributei', bruto: r });
          } catch (e) {
            linhas.push({ it, l: null, loc, esperado: difal ? NaN : (loc.st || 0), fonte: 'app', erro: e.message });
          }
        }
        const dif = (x) => isNaN(x.esperado) ? NaN : x.it.vSt - x.esperado;
        const problemas = linhas.filter(x => Math.abs(dif(x)) > 0.05);
        n.saida.replaceChildren(
          aviso(problemas.length ? `${problemas.length} item(ns) com ST diferente do esperado.` : 'Todos os itens batem com a simulação.', problemas.length ? 'erro' : 'ok'),
          h('p', { class: 'muted' }, `Recalculado item a item pela Simulação rápida (${origem} → ${destino}, ${difal ? 'DIFAL' : 'ICMS-ST'}).`),
          tabela([
            { titulo: '#', valor: (x) => x.it.item }, { titulo: 'Produto', valor: (x) => x.it.descricao.slice(0, 30) },
            { titulo: 'MVA', num: true, valor: (x) => pctFmt(x.l && !isNaN(x.l.mva) ? x.l.mva : x.loc.mvaAjustada) },
            { titulo: 'Na nota', num: true, valor: (x) => moeda(x.it.vSt) },
            { titulo: 'Esperado', num: true, valor: (x) => h('b', {}, moeda(x.esperado)) },
            { titulo: 'Diferença', num: true, valor: (x) => isNaN(dif(x)) ? '—' : (Math.abs(dif(x)) <= 0.05 ? chip('✓ ok', 'mini ok') : chip(moeda(dif(x)), 'mini erro')) },
            { titulo: 'Quem recolhe', valor: (x) => x.l?.quem || (x.loc.temSt ? 'fornecedor (app)' : '—') },
            { titulo: 'Fonte', valor: (x) => chip(x.fonte, x.fonte === 'Tributei' ? 'mini azul' : 'mini') }
          ], linhas, { classeLinha: (x) => Math.abs(dif(x)) > 0.05 ? 'div' : '' }),
          !saidaNota ? h('p', { class: 'muted' }, 'Se a nota não destacou ST e o esperado é maior que zero, a Freedom recolhe a antecipação/ST na entrada.') : null,
          jsonBruto(linhas.map(x => x.bruto || { erro: x.erro })));
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
