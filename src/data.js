// Dados de referência da Freedom (vindos da ficha revisada e das telas do sistema em 22/10/2026).

export const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

export const UF_NOMES = {AC:'Acre',AL:'Alagoas',AP:'Amapá',AM:'Amazonas',BA:'Bahia',CE:'Ceará',DF:'Distrito Federal',ES:'Espírito Santo',GO:'Goiás',MA:'Maranhão',MT:'Mato Grosso',MS:'Mato Grosso do Sul',MG:'Minas Gerais',PA:'Pará',PB:'Paraíba',PR:'Paraná',PE:'Pernambuco',PI:'Piauí',RJ:'Rio de Janeiro',RN:'Rio Grande do Norte',RS:'Rio Grande do Sul',RO:'Rondônia',RR:'Roraima',SC:'Santa Catarina',SP:'São Paulo',SE:'Sergipe',TO:'Tocantins'};

// Alíquota interna geral por UF (aba "Alíquotas ICMS")
export const ALIQ_INTERNA = {AC:.19,AL:.205,AP:.18,AM:.2,BA:.205,CE:.2,DF:.2,ES:.17,GO:.19,MA:.23,MT:.17,MS:.17,MG:.18,PA:.19,PB:.2,PR:.195,PE:.205,PI:.225,RJ:.2,RN:.2,RS:.17,RO:.195,RR:.2,SC:.17,SP:.18,SE:.19,TO:.2};

// Estados onde a Freedom tem filial ativa (vende de dentro do estado, sem ST)
export const FILIAIS = ['PR','RJ','SP'];

// Categorias de produto (uma por NCM)
export const CATEGORIAS = [
  { id: 'cabos',        nome: 'Cabos',         ncm: '8544.42.00', cest: '12.007.00' },
  { id: 'carregadores', nome: 'Carregadores',  ncm: '8504.40.10', cest: '21.037.00' },
  { id: 'fones',        nome: 'Fones',         ncm: '8518.30.00', cest: '21.057.00' },
  { id: 'suportes',     nome: 'Suportes',      ncm: '3926.90.90', cest: '' }
];

export const categoriaPorNcm = (ncm) => CATEGORIAS.find(c => soDigitos(c.ncm) === soDigitos(ncm));
export const categoriaPorCest = (cest) => CATEGORIAS.find(c => c.cest && soDigitos(c.cest) === soDigitos(cest));
export const soDigitos = (s) => String(s ?? '').replace(/\D/g, '');

// CST ICMS cadastrado no sistema da Freedom (Freedom Tech LTDA, cliente contribuinte)
// ordem: cabos, carregadores, fones, suportes
const CST_TXT = 'AC:210,200,200,200|AL:200,200,200,200|AP:210,210,210,200|AM:200,200,200,200|BA:200,200,200,200|CE:200,200,200,200|DF:210,200,200,200|ES:200,200,200,200|GO:200,200,200,200|MA:200,200,200,200|MT:210,210,210,200|MS:200,200,200,200|MG:210,210,210,200|PA:200,200,200,200|PB:210,200,200,200|PR:260,251,251,251|PE:200,200,200,200|PI:200,200,200,200|RJ:260,260,260,200|RN:200,200,200,200|RS:200,200,200,200|RO:200,200,200,200|RR:200,200,200,200|SC:200,200,200,200|SP:260,260,260,200|SE:200,200,200,200|TO:200,200,200,200';
export const CST_SISTEMA_PADRAO = Object.fromEntries(CST_TXT.split('|').map(l => {
  const [uf, v] = l.split(':'); const a = v.split(',');
  return [uf, { cabos: a[0], carregadores: a[1], fones: a[2], suportes: a[3] }];
}));

// Produtos da ficha Bazar Cable Box (custo sem imposto, unidade)
const PROD_TXT = `CBT1000|CABO TYPE-C TITANIUM|cabos|36.12
CBT1001|CABO TYPE-C PARA LIGHTNING TITANIUM|cabos|40.94
CBT1002|CABO TYPE-C PARA TYPE-C TITANIUM|cabos|36.12
CBIT1000|CABO IPHONE LIGHTNING TITANIUM|cabos|40.94
FO007|FONE BLUETOOTH EARBUD X TITANIUM|fones|109.68
CBCX001|FONTE TITANIUM 45W USB-A + USB-C|carregadores|77.24
CBT002|CABO TYPE-C PREMIUM|cabos|19.9
CBI002|CABO IPHONE LIGHTNING PREMIUM|cabos|19.9
HC005|FONTE TYPE-C + USB-A DUPLA PREMIUM|carregadores|40
CV003|CARREGADOR VEICULAR USB + TYPE-C|carregadores|29.9
FO002|FONE DE OUVIDO PREMIUM|fones|17.38
FO005|FONE DE OUVIDO IPHONE|fones|36.86
FO006|FONE DE OUVIDO TYPE-C|fones|32.76
CBT001|CABO TYPE-C|cabos|12.74
CBT003|CABO TYPE-C 2 METROS|cabos|20
CBTT004|CABO TYPE-C PARA TYPE-C|cabos|17.5
CBTT006|CABO TYPE-C PARA TYPE-C 2 METROS|cabos|18.02
CBTI001|CABO TYPE-C PARA LIGHTNING|cabos|17.5
CBI001|CABO IPHONE LIGHTNING|cabos|12.74
CBI003|CABO IPHONE LIGHTNING 2 METROS|cabos|20
CBM003|CABO MICRO-USB 2 METROS|cabos|15
CBAUX001|CABO AUXILIAR P2-P2|cabos|12.87
CARBT001|CONECTOR P2-BLUETOOTH|carregadores|15.45
HC001|FONTE USB|carregadores|19.7
CV001|CARREGADOR VEICULAR 2 SAÍDAS|carregadores|19.7
SP004|SUPORTE COM VENTOSA|suportes|20
SP009|SUPORTE AIR VENT|suportes|12.87`;
export const PRODUTOS_PADRAO = PROD_TXT.split('\n').map(l => {
  const [ref, nome, cat, custo] = l.split('|');
  return { ref, nome, cat, custo: Number(custo), importado: true };
});

export const TIPOS_GUIA = ['G-ICMS-ST', 'G-DIFAL', 'CTE-ST', 'CTE-DIFAL'];
export const STATUS_GUIA_ENTRADA = ['Pendentes', 'Geradas', 'Rejeitadas', 'Arquivadas'];
export const STATUS_GUIA_SAIDA = ['Pendentes', 'Geradas', 'Pagas', 'Rejeitadas', 'Arquivadas'];
