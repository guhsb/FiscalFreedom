// Descobre o que a chave da API libera e guarda o resultado.
// Cada recurso é testado com uma chamada segura (leitura, ou cálculo que não salva nada).
import { api, ErroApi } from './api.js';
import { config, dados } from './store.js';

export const RECURSOS = [
  { id: 'simulacao', nome: 'Simulação rápida', desc: 'Cálculo de ST/DIFAL por NCM e UF' },
  { id: 'lote', nome: 'Simulação em lote', desc: 'Vários produtos numa chamada só' },
  { id: 'clientes', nome: 'Dados da empresa', desc: 'Cadastro na conta do Tributei' },
  { id: 'calculoSaida', nome: 'Cálculo de XML (saídas)', desc: 'Notas de saída sem salvar' },
  { id: 'calculoEntrada', nome: 'Cálculo de XML (entradas)', desc: 'Notas de entrada sem salvar' },
  { id: 'icmsstSaida', nome: 'Notas de ICMS-ST (saídas)', desc: 'Base do relatório' },
  { id: 'nfesEntrada', nome: 'Notas de entrada', desc: 'Base do relatório de entradas' },
  { id: 'guiasSaida', nome: 'Guias de saída', desc: 'Listar, emitir e arquivar' },
  { id: 'guiasEntrada', nome: 'Guias de entrada', desc: 'Listar, emitir e arquivar' }
];

// Nota mínima só para testar a rota de cálculo (nada é salvo)
const XML_TESTE = `<?xml version="1.0" encoding="UTF-8"?><nfeProc><NFe><infNFe Id="NFe41000000000000000000550010000000011000000010" versao="4.00"><ide><cUF>41</cUF><nNF>1</nNF><serie>1</serie><dhEmi>2026-01-01T10:00:00-03:00</dhEmi><tpNF>1</tpNF></ide><emit><CNPJ>00000000000000</CNPJ><xNome>TESTE</xNome><enderEmit><UF>PR</UF></enderEmit></emit><dest><CNPJ>00000000000000</CNPJ><xNome>TESTE</xNome><enderDest><UF>MT</UF></enderDest><indIEDest>1</indIEDest></dest><det nItem="1"><prod><cProd>1</cProd><xProd>CABO</xProd><NCM>85444200</NCM><CEST>1200700</CEST><CFOP>6102</CFOP><qCom>1</qCom><vProd>100.00</vProd></prod><imposto><ICMS><ICMS00><orig>2</orig><CST>00</CST><vBC>100.00</vBC><pICMS>4.00</pICMS><vICMS>4.00</vICMS></ICMS00></ICMS></imposto></det><total><ICMSTot><vProd>100.00</vProd><vNF>100.00</vNF></ICMSTot></total></infNFe></NFe></nfeProc>`;

const arquivoTeste = () => ({ nome: 'teste.xml', data: new TextEncoder().encode(XML_TESTE).buffer, texto: XML_TESTE });

const SIM_TESTE = (c) => ({
  tipoOperacao: 'venda', tipoCalculo: 'icmsst', cliente_atuacao: c.regraMT, destinatario_simples: '2', simples: '2',
  estado_emit: [c.uf], estado_dest: ['MT'], importado: true, ncm: '8544.42.00', cest: '12.007.00', quantidade: 1, vUnit: 100
});

const TESTES = {
  simulacao: (c) => api.simulacao(SIM_TESTE(c)),
  lote: (c) => { const { importado, ncm, cest, quantidade, vUnit, ...r } = SIM_TESTE(c); return api.simulacaoLote({ ...r, produtos: [{ importado, ncm, cest, quantidade, vUnit }] }); },
  clientes: () => api.clientes(),
  calculoSaida: () => api.calcularXml('saidas', arquivoTeste(), false),
  calculoEntrada: () => api.calcularXml('entrada', arquivoTeste(), false),
  icmsstSaida: (c) => api.icmsstSaida(c.ano, c.uf),
  nfesEntrada: (c) => api.nfesEntrada(c.ano, c.uf, 'icmsst'),
  guiasSaida: () => api.guias('saidas', 'Pendentes'),
  guiasEntrada: () => api.guias('entrada', 'Pendentes')
};

// 2xx = liberado. 400/422/500 = a rota aceitou a chave e só recusou os dados de teste (liberado).
// 401/403/404 = a chave não alcança. 0 = sem internet (não dá para saber).
function interpretar(e) {
  if (!(e instanceof ErroApi)) return { ok: null, msg: e.message };
  const s = e.status;
  if (s === 0) return { ok: null, status: s, msg: 'Sem conexão' };
  if ([400, 405, 409, 422, 500].includes(s)) return { ok: true, status: s, msg: 'Liberado (os dados de teste foram recusados, o que é esperado)' };
  return { ok: false, status: s, msg: s === 404 ? 'Não liberado para esta chave (ou rota inexistente)' : 'Não liberado para esta chave' };
}

export async function verificarAcessos(aoProgresso = () => {}) {
  const c = config.get();
  const r = {};
  for (const rec of RECURSOS) {
    aoProgresso(rec);
    try { const resp = await TESTES[rec.id](c); r[rec.id] = { ok: true, status: 200, msg: 'Liberado', exemplo: rec.id === 'simulacao' ? resp : undefined }; }
    catch (e) { r[rec.id] = interpretar(e); }
  }
  const a = { quando: new Date().toISOString(), r };
  dados.salvarAcessos(a);
  return a;
}

// true = liberado, false = bloqueado, null = ainda não verificado / sem conexão
export function tem(id) {
  const a = dados.acessos();
  if (!a?.r?.[id]) return null;
  return a.r[id].ok;
}

// Regras de cada ferramenta: qualquer um dos recursos listados já serve
export const NECESSITA = {
  calculadora: ['simulacao', 'lote'],
  simulador: ['simulacao', 'lote'],
  auditoria: ['simulacao', 'lote'],
  precos: ['simulacao', 'lote'],
  saida: ['calculoSaida', 'simulacao'],
  entrada: ['calculoEntrada', 'simulacao'],
  guias: ['guiasSaida', 'guiasEntrada'],
  relatorio: ['icmsstSaida', 'nfesEntrada']
};

export function ferramentaLiberada(idTela) {
  const precisa = NECESSITA[idTela];
  if (!precisa) return true;
  const est = precisa.map(tem);
  if (est.some(x => x === true)) return true;
  if (est.every(x => x === false)) return false;
  return null; // não verificado
}
