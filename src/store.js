// Configurações e dados salvos no aparelho.
import { CST_SISTEMA_PADRAO, PRODUTOS_PADRAO } from './data.js';

const PREFIXO = 'ffiscal.';
const ler = (k, padrao) => {
  try { const v = localStorage.getItem(PREFIXO + k); return v == null ? padrao : JSON.parse(v); }
  catch { return padrao; }
};
const gravar = (k, v) => { try { localStorage.setItem(PREFIXO + k, JSON.stringify(v)); } catch {} };

export const config = {
  get: () => ({ cnpj: '42228446000118', uf: 'PR', ano: String(new Date().getFullYear()), regraMT: 'mva_original_two_b', tema: 'auto', ...ler('config', {}) }),
  set: (parcial) => gravar('config', { ...config.get(), ...parcial })
};

export const dados = {
  produtos: () => ler('produtos', PRODUTOS_PADRAO),
  salvarProdutos: (p) => gravar('produtos', p),
  cstSistema: () => ler('cstSistema', CST_SISTEMA_PADRAO),
  salvarCstSistema: (c) => gravar('cstSistema', c),
  ultimaSimulacao: () => ler('ultimaSimulacao', null),
  salvarSimulacao: (s) => {
    const txt = JSON.stringify(s.brutos || []);
    gravar('ultimaSimulacao', txt.length > 400000 ? { ...s, brutos: [{ aviso: 'Resposta grande demais para guardar; rode a simulação de novo para ver.' }] } : s);
  },
  acessos: () => ler('acessos', null),
  salvarAcessos: (a) => gravar('acessos', a),
  calculos: () => ler('calculos', []),
  registrarCalculo: (c) => gravar('calculos', [c, ...ler('calculos', [])].slice(0, 15)),
  historico: () => ler('historico', []),
  registrar: (item) => { const h = [item, ...ler('historico', [])].slice(0, 30); gravar('historico', h); }
};

// Chave da API: no PC fica criptografada pelo Windows; no celular fica no armazenamento do app.
export const chave = {
  async ler() {
    if (window.freedomDesktop) return (await window.freedomDesktop.lerChave()) || '';
    return ler('chave', '');
  },
  async salvar(v) {
    v = (v || '').trim();
    if (window.freedomDesktop) return window.freedomDesktop.salvarChave(v);
    gravar('chave', v);
  }
};
