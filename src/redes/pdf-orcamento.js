// Orçamento em PDF (padrão visual Freedom) com os dados embutidos para reabrir e comparar depois.
// Os dados embutidos NÃO levam custo nem margem (o PDF vai para a rede).
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import logoInline from '../logo.png?inline';

export const MARCA_PDF = 'ORCAMENTO_FREEDOM_V1:';
const MARCA_SANDER = 'PEDIDO_SANDER_V3:';

const b64 = (s) => { const b = new TextEncoder().encode(s); let bin = ''; b.forEach(x => (bin += String.fromCharCode(x))); return btoa(bin); };
const deB64 = (s) => { const bin = atob(s); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new TextDecoder().decode(a); };
const brl = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// orc = { numero, data, validadeDias, rede:{id,nome,uf}, loja:{cod,razao,cnpj,cidade,uf}|null, vendedor, condicao, obs,
//         itens:[{cod, codCliente, nome, qtd, preco, st, fcp}], totais:{produtos, st, fcp, total} }
export async function gerarPdfOrcamento(orc) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const PW = 210, M = 12, W = PW - 2 * M;
  const ROSA = [224, 69, 127], MARINHO = [15, 27, 61], CINZA = [75, 88, 117], LINHA = [225, 231, 239], ZEBRA = [246, 248, 252];

  try { doc.addImage(logoInline, 'PNG', M, M, 30, 30 * 109 / 240); } catch {}
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...MARINHO);
  doc.text('ORÇAMENTO', PW - M, M + 6, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...CINZA);
  doc.text(`Nº ${orc.numero}`, PW - M, M + 11.5, { align: 'right' });
  doc.text(`Emitido em ${orc.data} · válido por ${orc.validadeDias} dias`, PW - M, M + 16, { align: 'right' });
  doc.setDrawColor(...ROSA); doc.setLineWidth(0.6); doc.line(M, M + 20, PW - M, M + 20);

  let y = M + 27;
  const campo = (rot, val, x, w) => {
    doc.setFontSize(7); doc.setTextColor(...CINZA); doc.text(rot.toUpperCase(), x, y);
    doc.setFontSize(10); doc.setTextColor(...MARINHO); doc.text(doc.splitTextToSize(val || '—', w - 2)[0], x, y + 4.8);
  };
  const cli = orc.loja ? `${orc.loja.cod ? orc.loja.cod + ' - ' : ''}${orc.loja.razao}` : orc.rede.nome;
  campo('Cliente', cli, M, W * 0.62); campo('Rede', orc.rede.nome, M + W * 0.64, W * 0.36);
  y += 11;
  campo('CNPJ', orc.loja?.cnpj, M, W / 4); campo('Cidade / UF', orc.loja ? `${orc.loja.cidade}/${orc.loja.uf}` : orc.rede.uf, M + W / 4, W / 4);
  campo('Vendedor', orc.vendedor, M + W / 2, W / 4); campo('Pagamento', orc.condicao, M + 3 * W / 4, W / 4);
  y += 10;

  // Colunas para o cliente: sem custo/margem. ICMS-ST e DIFAL só aparecem se houver.
  const stI = (i) => ((i.st || 0) + (i.fcp || 0)) * i.qtd, difI = (i) => (i.difal || 0) * i.qtd;
  const temSt = orc.itens.some(i => stI(i) > 0), temDifal = orc.itens.some(i => difI(i) > 0);
  const head = [['Código', 'Produto', 'Qtd', 'Vlr unit.', 'Vlr total', ...(temSt ? ['ICMS-ST'] : []), ...(temDifal ? ['DIFAL'] : [])]];
  const body = orc.itens.map(i => [i.cod, i.nome, String(i.qtd), brl(i.preco), brl(i.preco * i.qtd), ...(temSt ? [stI(i) ? brl(stI(i)) : '—'] : []), ...(temDifal ? [difI(i) ? brl(difI(i)) : '—'] : [])]);
  const dir = { halign: 'right' };
  autoTable(doc, {
    startY: y, head, body, margin: { left: M, right: M }, theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.8, lineColor: LINHA, lineWidth: 0.2, textColor: [43, 53, 80] },
    headStyles: { fillColor: MARINHO, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: ZEBRA },
    columnStyles: { 0: { cellWidth: 22 }, 2: { ...dir, cellWidth: 12 }, 3: dir, 4: dir, 5: dir, 6: dir }
  });
  y = doc.lastAutoTable.finalY + 6;
  if (y > 250) { doc.addPage(); y = M + 6; }

  const tot = [['Produtos', brl(orc.totais.produtos)], ...(orc.totais.st + orc.totais.fcp ? [['ICMS-ST', brl(orc.totais.st + orc.totais.fcp)]] : []), ...(orc.totais.difal ? [['DIFAL', brl(orc.totais.difal)]] : [])];
  const xT = PW - M - 70;
  doc.setFontSize(9.5);
  tot.forEach(([a, b]) => { doc.setTextColor(...CINZA); doc.text(a, xT, y); doc.setTextColor(...MARINHO); doc.text(b, PW - M, y, { align: 'right' }); y += 5.5; });
  doc.setDrawColor(...LINHA); doc.line(xT, y - 3, PW - M, y - 3);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...ROSA);
  doc.text('Total', xT, y + 2); doc.text(brl(orc.totais.total), PW - M, y + 2, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  y += 10;
  doc.setFontSize(8.5); doc.setTextColor(...CINZA);
  const pecas = orc.itens.reduce((s, i) => s + i.qtd, 0);
  const ufDest = orc.loja?.uf || orc.rede.uf;
  doc.text(`${orc.itens.length} itens · ${pecas} peças · ${orc.livre ? 'Livre de ICMS-ST e DIFAL (faturado pela filial ' + ufDest + ')' : temSt ? 'ICMS-ST calculado para ' + ufDest : temDifal ? 'DIFAL calculado para ' + ufDest : 'Sem ICMS-ST para ' + ufDest}`, M, y);
  if (orc.obs) { y += 6; doc.setTextColor(...MARINHO); doc.text(doc.splitTextToSize('Observações: ' + orc.obs, W), M, y); }

  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(123, 135, 158);
    doc.text(`Grupo Freedom · Freedom Tech · orçamento ${orc.numero}`, M, 290);
    doc.text(`Página ${i} de ${paginas}`, PW - M, 290, { align: 'right' });
  }

  // dados para reabrir o orçamento no app (sem custo nem margem)
  const payload = { v: 1, numero: orc.numero, data: orc.data, iso: orc.iso, rede: orc.rede, loja: orc.loja, vendedor: orc.vendedor, condicao: orc.condicao, validadeDias: orc.validadeDias, obs: orc.obs,
    itens: orc.itens.map(i => ({ cod: i.cod, qtd: i.qtd, preco: +i.preco.toFixed(4), st: +(i.st || 0).toFixed(4), fcp: +(i.fcp || 0).toFixed(4), difal: +(i.difal || 0).toFixed(4) })), totais: orc.totais, livre: !!orc.livre };
  doc.setProperties({ title: `Orçamento ${orc.numero} - ${orc.rede.nome}`, subject: 'Orçamento Freedom', author: 'Freedom Tech', creator: 'Freedom Fiscal', keywords: MARCA_PDF + b64(JSON.stringify(payload)) });
  return doc.output('datauristring').split(',')[1];
}

// Lê o PDF e devolve { tipo:'orcamento'|'sander', dados }
export async function lerPdfEmbutido(buf) {
  const pdfjs = await import('pdfjs-dist');
  try { const w = await import('pdfjs-dist/build/pdf.worker.min.js?url'); pdfjs.GlobalWorkerOptions.workerSrc = w.default; } catch {}
  let pdf;
  try { pdf = await pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)), isEvalSupported: false }).promise; }
  catch { pdf = await pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)), disableWorker: true, isEvalSupported: false }).promise; }
  const meta = await pdf.getMetadata();
  const kw = String(meta?.info?.Keywords || '');
  if (kw.startsWith(MARCA_PDF)) return { tipo: 'orcamento', dados: JSON.parse(deB64(kw.slice(MARCA_PDF.length))) };
  if (kw.startsWith(MARCA_SANDER)) return { tipo: 'sander', dados: JSON.parse(deB64(kw.slice(MARCA_SANDER.length))) };
  throw new Error('Este PDF não tem os dados de um orçamento do app (nem de um pedido do painel da rede).');
}
