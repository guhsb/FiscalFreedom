import { h, card, campo, select, botao, aviso, toast, carregando, mostrarErro, tabelaAuto, jsonBruto } from '../ui.js';
import { config, chave, dados } from '../store.js';
import { api } from '../api.js';
import { UFS, CST_SISTEMA_PADRAO, PRODUTOS_PADRAO } from '../data.js';
import { listas } from '../extrair.js';
import { aplicarTema } from '../main.js';
import { RECURSOS, verificarAcessos } from '../acessos.js';
import { dataHora } from '../ui.js';

export default {
  id: 'config',
  titulo: 'Configurações',
  subtitulo: 'Chave da API, empresa e aparência',
  async render(el) {
    const c = config.get();
    const inChave = h('input', { type: 'password', placeholder: 'Cole aqui a API Key', autocomplete: 'off', value: await chave.ler() });
    const inCnpj = h('input', { type: 'text', inputmode: 'numeric', value: c.cnpj });
    const inUf = select(UFS, c.uf);
    const inAno = h('input', { type: 'number', value: c.ano, min: 2018, max: 2099 });
    const inMT = select([['mva_original_two_b', 'Art. 2º-B · Demais'], ['mva_original_two_a', 'Art. 2º-A · Atacadista'], ['mva_original_one', 'Art. 1º · Simples / créd. outorgado']], c.regraMT);
    const inTema = select([['auto', 'Automático'], ['claro', 'Claro'], ['escuro', 'Escuro']], c.tema);
    const resTeste = h('div');
    const painelAcessos = h('div');
    const desenharAcessos = (a) => {
      if (!a) { painelAcessos.replaceChildren(h('p', { class: 'muted' }, 'Ainda não verificado.')); return; }
      const ic = (ok) => ok === true ? ['ok', '✓'] : ok === false ? ['erro', '✕'] : ['atencao', '?'];
      painelAcessos.replaceChildren(
        h('p', { class: 'muted' }, `Verificado em ${dataHora(new Date(a.quando))}`),
        h('div', { class: 'lista' }, RECURSOS.map(r => { const x = a.r[r.id] || {}; const [cls, s] = ic(x.ok);
          return h('div', { class: 'it' }, h('div', { class: 'ic ' + cls }, s), h('div', {}, h('b', {}, r.nome), h('span', {}, `${r.desc} · ${x.msg || '—'}${x.status ? ' (' + x.status + ')' : ''}`))); })));
    };
    const verificarAgora = async () => {
      await chave.salvar(inChave.value);
      if (!inChave.value.trim()) return toast('Cole a chave primeiro', 'erro');
      const prog = carregando('Testando…'); painelAcessos.replaceChildren(prog);
      const a = await verificarAcessos((r) => (prog.lastChild.textContent = `Testando ${r.nome}…`));
      desenharAcessos(a);
      const n = RECURSOS.filter(r => a.r[r.id]?.ok).length;
      toast(`${n} de ${RECURSOS.length} recursos liberados`, n ? 'ok' : 'erro');
    };

    const salvar = async () => {
      await chave.salvar(inChave.value);
      config.set({ cnpj: inCnpj.value.replace(/\D/g, ''), uf: inUf.value, ano: inAno.value, regraMT: inMT.value, tema: inTema.value });
      aplicarTema();
      toast('Configurações salvas', 'ok');
    };

    const testar = async () => {
      await salvar();
      resTeste.replaceChildren(carregando('Testando a chave…'));
      try {
        const r = await api.clientes();
        const l = listas(r)[0];
        const itens = l ? l.itens : (r?.data ? [r.data] : []);
        resTeste.replaceChildren(aviso(`Conexão ok. ${itens.length} empresa(s) na sua conta do Tributei.`, 'ok'),
          itens.length ? tabelaAuto(itens.map(x => ({ nome: x.nome, cnpj: x.cnpj, estado: x.estado, calculo: x.calculo, regra: x.regra, atuacao: x.atuacao })), { colunasMax: 6 }) : null,
          jsonBruto(r));
      } catch (e) { mostrarErro(resTeste, e); }
    };

    desenharAcessos(dados.acessos());
    el.append(
      card(h('h2', {}, 'Chave da API do Tributei'),
        h('p', { class: 'desc' }, 'No Tributei: Perfil › Integração › copie a API Key. No PC ela fica guardada criptografada pelo Windows; no celular, só dentro do app.'),
        campo('API Key', inChave),
        h('label', { class: 'check', style: { marginTop: '10px' } }, h('input', { type: 'checkbox', onchange: (e) => (inChave.type = e.target.checked ? 'text' : 'password') }), 'Mostrar chave'),
        h('div', { class: 'acoes' }, botao('Salvar', salvar), botao('Testar e verificar acessos', verificarAgora, 'secundario')),
        resTeste),
      card(h('h2', {}, 'O que a sua chave libera'),
        h('p', { class: 'desc' }, 'O app testa cada recurso da API com uma chamada que não salva nada e libera só as ferramentas que funcionam. Rode de novo quando o Tributei ampliar a sua chave.'),
        painelAcessos,
        h('div', { class: 'acoes' }, botao('Verificar acessos', verificarAgora, 'secundario'))),
      card(h('h2', {}, 'Empresa'),
        h('p', { class: 'desc' }, 'Usado nas guias, notas e relatórios (o Tributei pede o CNPJ sem pontos).'),
        h('div', { class: 'campos' },
          campo('CNPJ', inCnpj), campo('UF da empresa', inUf),
          campo('Ano de competência', inAno), campo('Regra do MT (Portaria 195)', inMT))),
      card(h('h2', {}, 'Aparência'), campo('Tema', inTema)),
      h('div', { class: 'acoes' }, botao('Salvar tudo', salvar, 'primario cheio')),
      card(h('h2', {}, 'Dados de referência'),
        h('p', { class: 'desc' }, 'Lista de produtos e tabela de CST do sistema usadas nas ferramentas. Volte ao padrão da ficha Bazar Cable Box se algo sair errado.'),
        h('div', { class: 'acoes' },
          botao('Restaurar produtos', () => { dados.salvarProdutos(PRODUTOS_PADRAO); toast('Produtos restaurados', 'ok'); }, 'secundario'),
          botao('Restaurar CST do sistema', () => { dados.salvarCstSistema(CST_SISTEMA_PADRAO); toast('Tabela de CST restaurada', 'ok'); }, 'secundario')))
    );
  }
};
