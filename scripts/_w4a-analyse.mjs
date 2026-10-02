import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const t = readFileSync(join(tmpdir(), 'chapitre_long.txt'), 'utf8');
const lignes = t.split('\n');
const nonVides = lignes.filter((l) => l.trim() !== '');
let paras = 0, i = 0;
const tailles = [];
while (i < lignes.length) {
  if (lignes[i].trim() === '') { i++; continue; }
  const debut = i;
  while (i < lignes.length && lignes[i].trim() !== '') i++;
  paras++;
  tailles.push(lignes.slice(debut, i).reduce((s, l) => s + l.length, 0));
}
const suspects = nonVides.filter((l) => /^[\s*⁂#~=—–_.«»·•○●◇◆✳✱|\/\\+-]{2,}$/.test(l.trim()));
const simples = [];
let precVide = true;
for (const l of lignes) {
  const vide = l.trim() === '';
  if (!vide && !precVide) simples.push(l);
  precVide = vide;
}
console.log(JSON.stringify({
  chars: t.length,
  lignes: lignes.length,
  lignes_non_vides: nonVides.length,
  paragraphes: paras,
  taille_para_moy: Math.round(tailles.reduce((a, b) => a + b, 0) / paras),
  taille_para_max: Math.max(...tailles),
  lignes_multi_par_para: simples.length,
  ex_sep: [...new Set(suspects)].slice(0, 10),
  n_sep: suspects.length,
  debut: JSON.stringify(t.slice(0, 200)),
  ex_milieu: JSON.stringify(t.slice(40000, 40060)),
}, null, 1));
