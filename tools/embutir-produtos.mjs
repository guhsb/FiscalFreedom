// Gera os dados embutidos a partir do CSV de Produtos do sistema:
//  - src/motor/base-fiscal.json  -> PRODUCT_REGISTRY atualizado (sem custo)
//  - src/redes/custos.enc.json   -> custos criptografados (AES-GCM, chave derivada da senha com PBKDF2)
// Uso: node tools/embutir-produtos.mjs Produtos.csv "SENHA"
import fs from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';

const [arq, senha] = process.argv.slice(2);
if (!arq || !senha) { console.error('uso: node tools/embutir-produtos.mjs Produtos.csv SENHA'); process.exit(1); }
const buf = fs.readFileSync(arq);
let txt; try { txt = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { txt = new TextDecoder('latin1').decode(buf); }
const linhas = txt.replace(/\r/g, '').split('\n').filter(Boolean);
const parse = (l) => { const o = []; let c = '', q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (q) { if (ch === '"') { if (l[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; } else if (ch === '"') q = true; else if (ch === ';') { o.push(c); c = ''; } else c += ch; } o.push(c); return o; };
const head = parse(linhas[0]).map(s => s.trim());
const ix = (n) => head.indexOf(n);
const num = (s) => { s = String(s || '').trim(); if (!s) return null; const n = parseFloat(s.replace(/\./g, '').replace(',', '.')); return isFinite(n) ? n : null; };
const I = { cod: ix('CODPRODUTO'), prod: ix('PRODUTO'), ncm: ix('COD_NCM'), cf: ix('CODCLASSFISCAL'), sit: ix('SITUACAO'), venda: ix('PRECOVENDA'), custo: ix('PRECOCUSTO'), min: ix('PRECOMINIMO'), desc: ix('PERCDESCMAX'), est: ix('ESTOQUEATUAL'), marca: ix('Marca') };
const base = JSON.parse(fs.readFileSync('src/motor/base-fiscal.json', 'utf8'));
const reg = {}, custos = {};
for (const l of linhas.slice(1)) {
  const r = parse(l); const cod = (r[I.cod] || '').trim(); if (!cod) continue;
  const venda = num(r[I.venda]);
  reg[cod] = { desc: (r[I.prod] || '').trim(), ncm: (r[I.ncm] || '').replace(/\D/g, ''), classfiscal: (r[I.cf] || '').trim(), sit: (r[I.sit] || '').trim(), ...(venda > 0 ? { preco: Math.round(venda * 100) / 100 } : {}) };
  custos[cod] = [num(r[I.custo]), venda, num(r[I.min]), num(r[I.desc]), num(r[I.est]), (r[I.marca] || '').trim()];
}
base.PRODUCT_REGISTRY = reg;
fs.writeFileSync('src/motor/base-fiscal.json', JSON.stringify(base));

const enc = new TextEncoder();
const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
const k0 = await crypto.subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, k0, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const payload = JSON.stringify({ quando: new Date().toISOString(), arquivo: arq.split('/').pop(), custos });
const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(payload)));
const b64 = (u) => Buffer.from(u).toString('base64');
fs.writeFileSync('src/redes/custos.enc.json', JSON.stringify({ v: 1, iter: 250000, salt: b64(salt), iv: b64(iv), data: b64(data) }));
console.log(`produtos: ${Object.keys(reg).length} · com custo: ${Object.values(custos).filter(c => c[0] > 0).length}`);
