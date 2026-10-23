// Leitura local do XML da NF-e (funciona mesmo sem internet).
const t = (el, tag) => el?.getElementsByTagName(tag)?.[0]?.textContent?.trim() ?? '';
const n = (el, tag) => { const v = t(el, tag); return v === '' ? 0 : Number(v); };

export function lerNfe(texto) {
  const doc = new DOMParser().parseFromString(texto, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('XML inválido');
  const ide = doc.getElementsByTagName('ide')[0];
  const emit = doc.getElementsByTagName('emit')[0];
  const dest = doc.getElementsByTagName('dest')[0];
  const tot = doc.getElementsByTagName('ICMSTot')[0];
  if (!ide) throw new Error('Não parece uma NF-e (falta a tag <ide>)');
  const infNFe = doc.getElementsByTagName('infNFe')[0];
  const itens = [...doc.getElementsByTagName('det')].map(det => {
    const prod = det.getElementsByTagName('prod')[0];
    const icms = det.getElementsByTagName('ICMS')[0];
    const grupo = icms?.firstElementChild;
    const orig = t(grupo, 'orig');
    const cst = t(grupo, 'CST') || t(grupo, 'CSOSN');
    return {
      item: det.getAttribute('nItem'),
      codigo: t(prod, 'cProd'), descricao: t(prod, 'xProd'), ncm: t(prod, 'NCM'), cest: t(prod, 'CEST'),
      cfop: t(prod, 'CFOP'), qtd: n(prod, 'qCom'), valor: n(prod, 'vProd'),
      vFrete: n(prod, 'vFrete'), vSeg: n(prod, 'vSeg'), vDesc: n(prod, 'vDesc'), vOutro: n(prod, 'vOutro'),
      // origem 1, 2, 3 e 8 = conteúdo importado (alíquota interestadual de 4%)
      importado: ['1', '2', '3', '8'].includes(orig),
      orig, cst, cstCompleto: orig + cst,
      bc: n(grupo, 'vBC'), pIcms: n(grupo, 'pICMS'), vIcms: n(grupo, 'vICMS'),
      mva: n(grupo, 'pMVAST'), bcSt: n(grupo, 'vBCST'), pIcmsSt: n(grupo, 'pICMSST'), vSt: n(grupo, 'vICMSST'),
      vFcpSt: n(grupo, 'vFCPST'), vIpi: n(det, 'vIPI')
    };
  });
  return {
    chave: (infNFe?.getAttribute('Id') || '').replace(/^NFe/, ''),
    numero: t(ide, 'nNF'), serie: t(ide, 'serie'), emissao: t(ide, 'dhEmi') || t(ide, 'dEmi'),
    tipo: t(ide, 'tpNF') === '0' ? 'entrada' : 'saida',
    emitente: { nome: t(emit, 'xNome'), cnpj: t(emit, 'CNPJ'), uf: t(emit?.getElementsByTagName('enderEmit')[0], 'UF') },
    destinatario: {
      nome: t(dest, 'xNome'), doc: t(dest, 'CNPJ') || t(dest, 'CPF'), uf: t(dest?.getElementsByTagName('enderDest')[0], 'UF'),
      contribuinte: t(dest, 'indIEDest') === '1', indIEDest: t(dest, 'indIEDest')
    },
    totais: { produtos: n(tot, 'vProd'), st: n(tot, 'vST'), fcpSt: n(tot, 'vFCPST'), ipi: n(tot, 'vIPI'), nota: n(tot, 'vNF'), icms: n(tot, 'vICMS') },
    itens
  };
}
