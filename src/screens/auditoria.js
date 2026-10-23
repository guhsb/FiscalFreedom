// 2. Auditoria do cadastro fiscal do sistema (CST por UF) contra o Tributei.
import { h, card, rotulo, chip, botao, aviso, vazio, tabela, exportarXlsx, carimbo, dataHora, pctFmt, toast } from '../ui.js';
import { dados } from '../store.js';
import { UFS, CATEGORIAS, FILIAIS, UF_NOMES } from '../data.js';

const OPCOES_CST = ['200', '210', '251', '260', '270', '290'];

// Compara: retorna lista de { uf, cat, sistema, esperado, motivo, tipo }
export function auditar(sim, cst) {
  const achados = [];
  for (const uf of UFS) {
    for (const k of CATEGORIAS) {
      const sis = cst[uf]?.[k.id];
      const r = sim?.porUf?.[uf]?.[k.id];
      if (FILIAIS.includes(uf)) continue; // regra própria (diferimento / filial)
      if (!r) { if (sis === '210') achados.push({ uf, cat: k, sistema: sis, esperado: '?', tipo: 'atencao', motivo: 'Sistema tem ST, mas a UF não entrou na última simulação.' }); continue; }
      const esperado = r.temSt ? '210' : '200';
      if (sis !== esperado) {
        achados.push({
          uf, cat: k, sistema: sis || '(vazio)', esperado, tipo: 'erro',
          motivo: r.temSt
            ? `Tributei: fornecedor recolhe ST (${pctFmt(r.pctSt)} do valor, MVA ${pctFmt(r.mva)}). O sistema não destaca.`
            : (/DESTINAT/.test(r.quem || '') ? 'Tributei: quem recolhe é o destinatário. O sistema destaca ST.' : 'Tributei: sem ST para este NCM. O sistema destaca ST.')
        });
      }
    }
  }
  return achados;
}

export default {
  id: 'auditoria',
  titulo: 'Auditoria do sistema',
  subtitulo: 'CST cadastrado × Tributei',
  resumo: 'Aponta onde o CST do seu sistema não bate com o ST do Tributei',
  icone: 'check', cor: 'azul', largo: true,
  async render(el) {
    const sim = dados.ultimaSimulacao();
    let cst = dados.cstSistema();
    const resultado = h('div');

    const atualizar = () => {
      const achados = auditar(sim, cst);
      const erros = achados.filter(a => a.tipo === 'erro');
      resultado.replaceChildren(
        card(rotulo('Resultado'),
          h('div', { class: 'grande' }, erros.length ? `${erros.length} divergência${erros.length > 1 ? 's' : ''}` : 'Tudo certo'),
          h('div', { class: 'heroi' }, h('div', { class: 'linha' }, sim ? `Simulação de ${dataHora(new Date(sim.quando))} · ${Object.keys(sim.porUf).length} UFs` : 'Sem simulação'),
            h('div', { class: 'chips' }, erros.length ? chip('✕ revisar no sistema', 'erro') : chip('✓ sistema igual ao Tributei', 'ok'), chip(`Filiais ${FILIAIS.join(', ')} fora da conferência`)))),
        achados.length ? card(h('h2', {}, 'O que merece atenção'),
          h('div', { class: 'lista' }, achados.slice(0, 40).map(a => h('div', { class: 'it' },
            h('div', { class: 'ic ' + a.tipo }, a.tipo === 'erro' ? '✕' : '!'),
            h('div', {}, h('b', {}, `${a.cat.nome} · ${a.uf} (${UF_NOMES[a.uf]}): sistema ${a.sistema}, esperado ${a.esperado}`), h('span', {}, a.motivo))))),
          h('div', { class: 'acoes' }, botao('Exportar divergências', () => exportarXlsx(`Auditoria-CST_${carimbo()}.xlsx`, [{
            nome: 'Divergências', linhas: [['UF', 'Produto', 'NCM', 'CST no sistema', 'CST esperado', 'Motivo'], ...achados.map(a => [a.uf, a.cat.nome, a.cat.ncm, a.sistema, a.esperado, a.motivo])]
          }]), 'secundario'))) : null
      );
    };

    const matriz = tabela(
      [{ titulo: 'UF', valor: (uf) => h('b', {}, uf) }, ...CATEGORIAS.map(k => ({
        titulo: `${k.nome} (${k.ncm})`,
        valor: (uf) => {
          const s = h('select', { onchange: (e) => { cst = { ...cst, [uf]: { ...cst[uf], [k.id]: e.target.value } }; dados.salvarCstSistema(cst); atualizar(); } },
            OPCOES_CST.map(o => h('option', { value: o, selected: cst[uf]?.[k.id] === o }, o)));
          return s;
        }
      }))], UFS);

    el.append(
      sim ? null : aviso(h('span', {}, 'Faça primeiro uma simulação para comparar. ', h('a', { href: '#/simulador', style: { color: 'inherit', fontWeight: 700 } }, 'Abrir simulador')), 'info'),
      resultado,
      card(h('h2', {}, 'CST cadastrado no sistema'),
        h('p', { class: 'desc' }, 'Já vem preenchido com as telas de ICMS que você mandou (Freedom Tech LTDA, cliente contribuinte). Mude aqui quando alterar o cadastro do sistema.'),
        matriz,
        h('div', { class: 'acoes' }, botao('Recalcular', () => { atualizar(); toast('Auditoria atualizada'); }, 'secundario'))));
    atualizar();
  }
};
