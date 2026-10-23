import './style.css';
import logoUrl from './logo.png';
import { h, card, rotulo, chip, aviso } from './ui.js';
import { icone } from './icones.js';
import { config, chave } from './store.js';
import { verificar, APP_VERSAO } from './controle.js';

import simulador from './screens/simulador.js';
import auditoria from './screens/auditoria.js';
import precos from './screens/precos.js';
import saida from './screens/saida.js';
import entrada from './screens/entrada.js';
import guias from './screens/guias.js';
import relatorio from './screens/relatorio.js';
import configuracoes from './screens/config.js';

export const TELAS = [simulador, auditoria, precos, saida, entrada, guias, relatorio];
const TODAS = [...TELAS, configuracoes];
const app = document.getElementById('app');

export function aplicarTema() {
  const t = config.get().tema;
  if (t === 'claro' || t === 'escuro') document.documentElement.dataset.tema = t;
  else delete document.documentElement.dataset.tema;
}

function topo({ titulo, sub, voltar, extras = [] }) {
  return h('header', { class: 'topo' },
    voltar
      ? h('button', { class: 'ic-btn', title: 'Voltar', onclick: () => (location.hash = ''), html: icone('voltar') })
      : h('div', { class: 'logo' }, h('img', { src: logoUrl, alt: 'Freedom' })),
    h('div', { class: 'tt' }, h('h1', {}, titulo), sub ? h('div', { class: 'sub' }, sub) : null),
    ...extras);
}

async function inicio() {
  app.className = '';
  const temChave = !!(await chave.ler());
  const c = config.get();
  app.replaceChildren(
    topo({
      titulo: 'Freedom Fiscal',
      sub: `CNPJ ${c.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')} · ${c.uf}`,
      extras: [h('button', { class: 'ic-btn', title: 'Configurações', onclick: () => (location.hash = '#/config'), html: icone('config') })]
    }),
    temChave ? null : aviso(h('span', {}, 'Cadastre a chave da API do Tributei para começar. ', h('a', { href: '#/config', style: { color: 'inherit', fontWeight: 700 } }, 'Abrir configurações')), 'atencao'),
    card(
      h('div', { class: 'rotulo' }, 'Integração Tributei'),
      h('div', { class: 'grande' }, temChave ? 'Conectado' : 'Sem chave'),
      h('div', { class: 'heroi' }, h('div', { class: 'linha' }, 'Simulação de ICMS-ST, conferência de notas, guias e relatórios em um só lugar.'),
        h('div', { class: 'chips' }, temChave ? chip('✓ Chave cadastrada', 'ok') : chip('! Falta a chave', 'atencao'), chip(`Ano ${c.ano}`), chip(`MT: ${({ mva_original_one: 'art. 1º', mva_original_two_a: 'art. 2º-A', mva_original_two_b: 'art. 2º-B' })[c.regraMT]}`)))
    ),
    rotulo('Ferramentas'),
    h('div', { class: 'modulos' }, TELAS.map((t, i) => h('button', { class: 'modulo', onclick: () => (location.hash = '#/' + t.id) },
      h('div', { class: 'ic', style: { background: `var(--${t.cor}-s)`, color: `var(--${t.cor}-t)` }, html: icone(t.icone) }),
      h('div', {}, h('b', {}, `${i + 1}. ${t.titulo}`), h('span', {}, t.resumo)),
      h('div', { class: 'seta' }, '›')))),
    h('div', { class: 'rodape' }, `Freedom Tech · Freedom Fiscal v${APP_VERSAO} · dados do Tributei`)
  );
}

async function rota() {
  aplicarTema();
  const id = location.hash.replace(/^#\/?/, '').split('?')[0];
  const tela = TODAS.find(t => t.id === id);
  window.scrollTo(0, 0);
  if (!tela) return inicio();
  app.className = tela.largo ? 'largo' : '';
  const corpo = h('main', {});
  const extras = [];
  app.replaceChildren(topo({ titulo: tela.titulo, sub: tela.subtitulo, voltar: true, extras }), corpo);
  try { await tela.render(corpo, { topo: app.firstChild }); }
  catch (e) { corpo.replaceChildren(aviso('Erro ao abrir a tela: ' + e.message, 'erro')); console.error(e); }
}

// ---------- Controle remoto (controle.json no GitHub) ----------
let bloqueio = null;

function telaBloqueio(b) {
  app.className = '';
  app.replaceChildren(
    h('div', { class: 'bloqueio' },
      h('div', { class: 'logo grande-logo' }, h('img', { src: logoUrl, alt: 'Freedom' })),
      h('div', { class: 'bloqueio-ic' }, b.atualizar ? '↑' : '⏻'),
      h('h1', {}, b.titulo),
      h('p', {}, b.texto),
      h('button', { class: 'botao', type: 'button', onclick: checarControle }, 'Tentar de novo'),
      h('div', { class: 'muted' }, `Freedom Fiscal v${APP_VERSAO}`)));
}

async function checarControle() {
  const r = await verificar();
  const estava = !!bloqueio;
  bloqueio = r.liberado ? null : r;
  if (bloqueio) telaBloqueio(bloqueio);
  else if (estava) rota();
}

window.addEventListener('hashchange', () => (bloqueio ? telaBloqueio(bloqueio) : rota()));
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', aplicarTema);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checarControle(); });
setInterval(checarControle, 15 * 60 * 1000);

(async () => {
  aplicarTema();
  app.replaceChildren(h('div', { class: 'carregando', style: { justifyContent: 'center', paddingTop: '40vh' } }, h('i', { class: 'spin' }), 'Abrindo…'));
  await checarControle();
  if (!bloqueio) rota();
})();
