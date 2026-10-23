// Cliente da API do Tributei (https://tributei.readme.io).
// PC: a chamada passa pelo processo do Electron. Celular: CapacitorHttp (fetch nativo, sem CORS).
import { chave, config } from './store.js';

export const BASES = {
  entrada: 'https://api.tributei.net/api',
  saidas: 'https://apisaidas.tributei.net/api'
};

export class ErroApi extends Error {
  constructor(status, corpo) {
    super(mensagemErro(status, corpo));
    this.status = status; this.corpo = corpo;
  }
}

function mensagemErro(status, corpo) {
  let msg = '';
  try { const j = JSON.parse(corpo); msg = j.message || j.error || j.erro || ''; if (typeof msg !== 'string') msg = JSON.stringify(msg); } catch { msg = (corpo || '').slice(0, 200); }
  const base = {
    0: 'Sem conexão com o Tributei',
    400: 'Algum dado enviado está faltando ou inválido',
    401: 'Chave da API inválida ou ausente (Configurações)',
    403: 'Acesso negado pelo Tributei',
    404: 'Rota ou registro não encontrado (ou chave inválida)',
    422: 'Dados recusados pelo Tributei',
    500: 'Erro interno no Tributei'
  }[status] || ('Erro ' + status);
  return msg ? `${base}: ${msg}` : base;
}

async function transporte({ url, method, headers, json, form }) {
  if (window.freedomDesktop) {
    const r = await window.freedomDesktop.request({ url, method, headers, json, form });
    return { status: r.status, corpo: r.body };
  }
  const opts = { method, headers: { ...headers } };
  if (form) {
    const fd = new FormData();
    for (const c of form) {
      if (c.data) fd.append(c.name, new Blob([c.data], { type: c.type || 'application/xml' }), c.filename || 'arquivo.xml');
      else fd.append(c.name, String(c.value ?? ''));
    }
    opts.body = fd;
  } else if (json !== undefined) {
    opts.body = JSON.stringify(json);
    opts.headers['Content-Type'] = 'application/json';
  }
  try {
    const res = await fetch(url, opts);
    return { status: res.status, corpo: await res.text() };
  } catch (e) {
    return { status: 0, corpo: e.message + (location.protocol.startsWith('http') ? ' (no navegador a API pode bloquear por CORS; use o app de PC ou celular)' : '') };
  }
}

export async function chamar(base, method, path, { json, form } = {}) {
  const k = await chave.ler();
  if (!k) throw new ErroApi(401, 'Cadastre a chave da API em Configurações.');
  const url = BASES[base] + path;
  const r = await transporte({
    url, method,
    headers: { Accept: 'application/json', Authorization: 'Bearer ' + k },
    json, form
  });
  let dadosResp = r.corpo;
  try { dadosResp = JSON.parse(r.corpo); } catch {}
  if (r.status < 200 || r.status >= 300) throw new ErroApi(r.status, r.corpo);
  return dadosResp;
}

const cnpj = () => config.get().cnpj.replace(/\D/g, '');
const enc = encodeURIComponent;

export const api = {
  // Clientes
  clientes: () => chamar('entrada', 'GET', '/perfil/clientes'),

  // Simulador
  simulacao: (corpo) => chamar('entrada', 'POST', '/simulador/pedidos/novo', { json: corpo }),
  simulacaoLote: (corpo) => chamar('entrada', 'POST', '/simulador/pedidos/novo/lote', { json: corpo }),

  // Notas (cálculo sem salvar / com salvar)
  calcularXml: (base, arquivo, difal, extras = {}) => chamar(base, 'POST', `/calculo/xml/${difal ? 'true' : 'false'}`, {
    form: [{ name: 'file', data: arquivo.data, filename: arquivo.nome, type: 'text/xml' },
      ...Object.entries(extras).filter(([, v]) => v).map(([name, value]) => ({ name, value }))]
  }),
  enviarXml: (base, arquivo, difal) => chamar(base, 'POST', `/upload/xml/${difal ? 'true' : 'false'}`, {
    form: [{ name: 'file', data: arquivo.data, filename: arquivo.nome, type: 'text/xml' }]
  }),

  // Notas de entrada salvas
  nfesEntrada: (ano, uf, tipo) => chamar('entrada', 'GET', `/${cnpj()}/${enc(ano)}/${enc(uf)}/nfe/${tipo}`),

  // ICMS-ST de saída
  icmsstSaida: (ano, uf) => chamar('saidas', 'GET', `/${cnpj()}/${enc(ano)}/${enc(uf)}/nfe/icmsst`),
  notaIcmsstSaida: (ano, uf, id) => chamar('saidas', 'GET', `/${cnpj()}/${enc(ano)}/${enc(uf)}/nfe/icmsst/${enc(id)}/edit`),
  notaDifalSaida: (ano, uf, id) => chamar('saidas', 'GET', `/${cnpj()}/${enc(ano)}/${enc(uf)}/nfe/difal/${enc(id)}/edit`),
  automacaoDifal: (ano, uf, id) => chamar('saidas', 'GET', `/${cnpj()}/${enc(ano)}/${enc(uf)}/automacao/difal/${enc(id)}`),

  // Guias
  guias: (base, status) => chamar(base, 'GET', `/${cnpj()}/guia/${enc(status)}`),
  emitirGuias: (base, ids) => chamar(base, 'POST', base === 'saidas' ? `/${cnpj()}/guia/emitirLoteGuia` : `/${cnpj()}/guia/sendLoteGuia`, { json: { ids: ids.map(Number), deletar: false } }),
  enviarAreaGuia: (uf, tipoGuia, ids) => chamar('saidas', 'POST', `/${cnpj()}/guia/sendLoteGuia`, { json: { UF: uf, estado: uf, tipoGuia, ids: ids.map(Number) } }),
  criarGuiaEntrada: (ano, uf, idNota, tipoGuia) => chamar('entrada', 'GET', `/${cnpj()}/guia/${enc(ano)}/${enc(uf)}/${enc(idNota)}/${enc(tipoGuia)}`),
  arquivarGuia: (base, id) => chamar(base, 'DELETE', `/${cnpj()}/guia/deletar/${enc(id)}`),

  // Consultas
  consultaCest: (ano, uf, ncm) => chamar('entrada', 'POST', `/${cnpj()}/${enc(ano)}/${enc(uf)}/consulta/cest`, { json: { query: ncm } })
};
