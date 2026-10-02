// JETABLE — statistiques de structure du texte : paragraphes, scènes, lignes.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const env = {};
for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const URLS = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const demo = JSON.parse(readFileSync(join(tmpdir(), 'shader-demo.json'), 'utf8'));
const JETON = demo.session.session.access_token;

const r = await fetch(
  `${URLS}/rest/v1/chapitres?livre_id=eq.${demo.livreId}&select=id,position,titre,texte_source,texte_traduit&order=position`,
  { headers: { apikey: KEY, Authorization: `Bearer ${JETON}` } }
);
const chapitres = await r.json();
console.error('STATUS', r.status, 'N', Array.isArray(chapitres) ? chapitres.length : 'objet');
if (!Array.isArray(chapitres)) {
  console.log('ERREUR', JSON.stringify(chapitres).slice(0, 300));
  process.exit(1);
}
for (const c of chapitres) {
  const t = (c.texte_traduit || c.texte_source || '');
  const paras = t.split(/\n[ \t]*\n+/).filter((p) => p.trim() !== '');
  const lignes = t.split('\n');
  const nonVides = lignes.filter((l) => l.trim() !== '');
  const simples = [];
  let precVide = false;
  for (const l of lignes) {
    const vide = l.trim() === '';
    if (!vide && !precVide) simples.push(l);
    precVide = vide;
  }
  const suspects = nonVides.filter((l) =>
    /^[\s*⁂#~=—–\-_.«»·•○●◇◆✳✱—|\/\\+]{2,}\s*$/.test(l.trim())
  );
  console.log(
    JSON.stringify({
      pos: c.position,
      titre: c.titre,
      chars: t.length,
      paragraphes: paras.length,
      lignes_non_vides: nonVides.length,
      lignes_apres_vide: simples.length,
      sections_double_newline: (t.match(/\n\s*\n/g) || []).length,
      separateurs_scene: suspects.length,
      exemples_sep: [...new Set(suspects.slice(0, 6))].map((s) => JSON.stringify(s.slice(0, 30))),
      debut: JSON.stringify(t.slice(0, 120)),
      ex_dialogue: JSON.stringify(simples.find((l) => /^[«"—-]/.test(l.trim()))?.slice(0, 90) ?? null),
    })
  );
}
