// Ajoute `alternates: { canonical: ... }` aux pages publiques.
// Idempotent : ne touche pas un fichier qui a déjà une canonique.
import { readFileSync, writeFileSync } from 'node:fs';

const pages = [
  ['app/(public)/page.tsx', '/'],
  ['app/(public)/tarifs/page.tsx', '/tarifs'],
  ['app/(public)/faq/page.tsx', '/faq'],
  ['app/(public)/contact/page.tsx', '/contact'],
  ['app/(public)/conditions/page.tsx', '/conditions'],
  ['app/(public)/confidentialite/page.tsx', '/confidentialite'],
  ['app/(public)/cookies/page.tsx', '/cookies'],
  ['app/(public)/mentions-legales/page.tsx', '/mentions-legales'],
  ['app/(public)/remboursement/page.tsx', '/remboursement'],
];

let modifies = 0;
for (const [fichier, chemin] of pages) {
  const texte = readFileSync(fichier, 'utf8');
  if (texte.includes('alternates:')) {
    console.log(`= ${fichier} (déjà canonique)`);
    continue;
  }
  const ancre = /export const metadata: Metadata = \{\r?\n/;
  if (!ancre.test(texte)) {
    console.log(`! ${fichier} : bloc metadata introuvable`);
    continue;
  }
  const remplace = texte.replace(
    ancre,
    (m) => `${m}  alternates: { canonical: '${chemin}' },\n`
  );
  writeFileSync(fichier, remplace, 'utf8');
  modifies += 1;
  console.log(`+ ${fichier} → ${chemin}`);
}
console.log(`\n${modifies} fichier(s) modifié(s)`);
