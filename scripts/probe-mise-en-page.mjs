
// Sonde mise en page réelle (taille police, interligne, lettrines).
import { readFileSync } from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const CHEMIN =
  'C:/Users/dosso/AppData/Local/hermes/profiles/devotron/cache/documents/doc_7091958450d0__OceanofPDF.com_The_Reaper_-__RuNyx.pdf';
const donnees = new Uint8Array(readFileSync(CHEMIN));
const tache = pdfjs.getDocument({ data: donnees, useSystemFonts: true });
const doc = (await tache.promise);

function freq(tab) {
  const tabou = tab.reduce((m, v) => ((m[v] = (m[v] || 0) + 1), m), {});
  return Object.entries(tabou)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 5)
    .map((e) => `${e[0]}x${e[1]}`)
    .join('  ');
}

// 1) Quelques pages de corpus : taille dominante, max (lettrine?), marges.
for (const num of [5, 20, 100]) {
  const p = await doc.getPage(num);
  const vp = p.getViewport({ scale: 1 });
  const tp = await p.getTextContent();
  const items = tp.items.filter((it) => (it.str ?? '').trim() !== '' && it.width > 0);
  const tailles = items.map((it) => +Math.abs(it.transform[0]).toFixed(1));
  const xs = items.map((it) => Math.round(it.transform[4]));
  const ys = items.map((it) => Math.round(it.transform[5]));
  const yss = [...new Set(ys)].sort((a, b) => a - b);
  const deltas = yss.map((y, i) => (i > 0 ? y - yss[i - 1] : 0)).filter(Boolean);
  console.log(`page ${num} (${vp.width}x${vp.height}) items=${items.length}`);
  console.log(`  tailles   : ${freq(tailles)}  MAX=${Math.max(...tailles)}`);
  console.log(`  delta Y   : ${freq(deltas)} (med=${[...deltas].sort((a,b)=>a-b)[Math.floor(deltas.length/2)]})`);
  console.log(`  x min/max : ${Math.min(...xs)} / ${Math.max(...xs)}`);
  console.log(`  y min/max : ${Math.min(...ys)} / ${Math.max(...ys)}`);
  const prem = items[0];
  console.log(`  1er item  : "${prem.str.slice(0, 40)}" taille=${(+Math.abs(prem.transform[0]).toFixed(1))}`);
}
await tache.destroy();
