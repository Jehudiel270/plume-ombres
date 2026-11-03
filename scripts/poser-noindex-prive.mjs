// ============================================================
// Pose `noindex` sur toutes les pages privées.
//
//  * page serveur sans metadata  → ajoute `export const metadata = prive(...)`
//  * page cliente ('use client') → ne peut pas exporter metadata :
//    on crée un layout.tsx à côté, qui porte le noindex
//  * page avec metadata          → ajoute le bloc `robots` manquant
// Idempotent : relançable sans effet de bord.
// ============================================================
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const IMPORT = "import { prive } from '@/lib/metadata';\n";

const serveur = [
  ['app/bibliotheque/page.tsx', 'Bibliothèque'],
  ['app/livres/[id]/page.tsx', 'Lecture'],
  ['app/connexion/apercu/page.tsx', 'Aperçu'],
];

const clientes = [
  ['app/connexion', 'Connexion'],
  ['app/mot-de-passe-oublie', 'Mot de passe oublié'],
  ['app/nouveau-mot-de-passe', 'Nouveau mot de passe'],
  ['app/auth/reinitialiser', 'Réinitialisation'],
];

const dejaMetadonnees = [
  'app/compte/page.tsx',
  'app/favoris/page.tsx',
  'app/abonnement/page.tsx',
  'app/paiement/[plan]/page.tsx',
  'app/paiement/succes/page.tsx',
  'app/paiement/echec/page.tsx',
  'app/paiement/simulation/page.tsx',
];

/** Ajoute l'import `prive` juste après le dernier import du fichier. */
function ajouterImport(texte) {
  if (texte.includes("from '@/lib/metadata'")) return texte;
  const lignes = texte.split(/\r?\n/);
  let dernier = -1;
  for (let i = 0; i < lignes.length; i += 1) {
    if (/^import .*;$/.test(lignes[i]) || /^} from '.*';$/.test(lignes[i])) {
      dernier = i;
    }
  }
  if (dernier === -1) return texte;
  lignes.splice(dernier + 1, 0, IMPORT.trimEnd());
  return lignes.join('\n');
}

let actions = 0;

for (const [fichier, titre] of serveur) {
  let texte = readFileSync(fichier, 'utf8');
  if (/export const metadata/.test(texte)) {
    console.log(`= ${fichier} (déjà)`);
    continue;
  }
  texte = ajouterImport(texte);
  // Insère l'export après le dernier import.
  const lignes = texte.split(/\r?\n/);
  let dernier = -1;
  for (let i = 0; i < lignes.length; i += 1) {
    if (/^import .*;$/.test(lignes[i]) || /^} from '.*';$/.test(lignes[i])) dernier = i;
  }
  lignes.splice(dernier + 1, 0, '', `export const metadata = prive('${titre}');`);
  writeFileSync(fichier, lignes.join('\n'), 'utf8');
  actions += 1;
  console.log(`+ ${fichier} → noindex`);
}

for (const [dossier, titre] of clientes) {
  const chemin = `${dossier}/layout.tsx`;
  if (existsSync(chemin)) {
    console.log(`= ${chemin} (déjà)`);
    continue;
  }
  writeFileSync(
    chemin,
    `// Page cliente : l'export metadata est interdit ici, d'où ce layout.\n` +
      `import { prive } from '@/lib/metadata';\n\n` +
      `export const metadata = prive('${titre}');\n\n` +
      `export default function Layout({ children }: { children: React.ReactNode }) {\n` +
      `  return children;\n` +
      `}\n`,
    'utf8'
  );
  actions += 1;
  console.log(`+ ${chemin} → noindex`);
}

for (const fichier of dejaMetadonnees) {
  if (!existsSync(fichier)) {
    console.log(`! ${fichier} absent`);
    continue;
  }
  const texte = readFileSync(fichier, 'utf8');
  if (texte.includes('index: false')) {
    console.log(`= ${fichier} (déjà noindex)`);
    continue;
  }
  const remplace = texte.replace(
    /export const metadata[^=]*= \{\r?\n/,
    (m) => `${m}  robots: { index: false, follow: false },\n`
  );
  if (remplace === texte) {
    console.log(`! ${fichier} : bloc metadata non reconnu`);
    continue;
  }
  writeFileSync(fichier, remplace, 'utf8');
  actions += 1;
  console.log(`+ ${fichier} → noindex`);
}

console.log(`\n${actions} action(s)`);
