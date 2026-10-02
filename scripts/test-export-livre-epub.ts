// ============================================================
// test-export-livre-epub.ts — Test RÉEL de la chaîne « livre → EPUB »
// branchée à la bibliothèque (lib/export-livre-epub.ts +
// lib/relance-traduction.ts).
//
// Un faux client Supabase renvoie des chapitres comme en base ; on
// génère un VRAI fichier .epub, on l'écrit sur disque, puis on
// inspecte l'archive : mimetype (premier, non compressé), container,
// OPF (titre, auteur, langue FR, identifiant), navigation par
// chapitre (nav + ncx), un XHTML par chapitre, XML bien formé.
//
// Usage : npx tsx scripts/test-export-livre-epub.ts
// ============================================================

import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  chargerChapitresEpub,
  construireEpubLivre,
  exporterEpubLivre,
  nomFichierEpub,
  texteChapitrePourExport,
  type ResultatEpub,
} from '../lib/export-livre-epub';
import { chargerChapitresEnErreur } from '../lib/relance-traduction';

let echecs = 0;
function verifier(nom: string, condition: boolean, detail?: string) {
  if (!condition) {
    echecs += 1;
    console.error(`✗ ${nom}${detail ? ` — ${detail}` : ''}`);
  } else {
    console.log(`✓ ${nom}`);
  }
}

// ---------- Faux client Supabase (chaîne thenable) ----------
type Ligne = Record<string, unknown>;

function fauxSupabase(tables: Record<string, Ligne[]>): SupabaseClient {
  function constructeur(table: string) {
    const filtres: Array<[string, unknown]> = [];
    const api = {
      select: () => api,
      eq: (colonne: string, valeur: unknown) => {
        filtres.push([colonne, valeur]);
        return api;
      },
      order: () => api,
      then: (resoudre: (valeur: { data: Ligne[]; error: null }) => unknown) => {
        const lignes = (tables[table] ?? []).filter((l) =>
          filtres.every(([c, v]) => l[c] === v)
        );
        return Promise.resolve({ data: lignes, error: null }).then(resoudre);
      },
    };
    return api;
  }
  return { from: (t: string) => constructeur(t) } as unknown as SupabaseClient;
}

// ---------- Vérificateur XML bien formé (sous-ensemble) ----------
function verifierXmlBienForme(xml: string, nomFichier: string): string[] {
  const problemes: string[] = [];
  const corps = xml
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const pile: string[] = [];
  const re = /<\/?([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g;
  let m: RegExpExecArray | null;
  let racineVue = false;
  while ((m = re.exec(corps)) !== null) {
    const fermante = m[0].startsWith('</');
    const autoFermante = m[3] === '/';
    const nom = m[1];
    if (fermante) {
      if (pile.length === 0 || pile[pile.length - 1] !== nom) {
        problemes.push(`${nomFichier}: fermante </${nom}> inattendue`);
        return problemes;
      }
      pile.pop();
    } else if (!autoFermante) {
      if (pile.length === 0) {
        if (racineVue) problemes.push(`${nomFichier}: seconde racine <${nom}>`);
        racineVue = true;
      }
      pile.push(nom);
    }
  }
  if (pile.length > 0) problemes.push(`${nomFichier}: non fermée(s) ${pile.join(', ')}`);
  return problemes;
}

// ---------- Données d'exemple (comme en base) ----------
const LIVRE = {
  id: 'livre-1',
  titre: 'Nuit d’Autremonde',
  auteur: 'Autrice Test',
  langue_cible: 'fr',
};

const CHAPITRES: Ligne[] = [
  {
    livre_id: LIVRE.id,
    position: 1,
    titre: 'Chapitre 1 — La ruelle',
    texte_source: 'The night was cold.',
    texte_traduit: 'La nuit était froide.\n\nElle marchait vite.',
    statut: 'traduit',
  },
  {
    livre_id: LIVRE.id,
    position: 2,
    titre: 'Chapitre 2 — Ses invités',
    texte_source: 'They came at dusk & left at dawn.',
    texte_traduit: 'Ils vinrent au crépuscule & repartirent à l’aube.',
    statut: 'traduit',
  },
  {
    livre_id: LIVRE.id,
    position: 3,
    titre: 'Chapitre 3 — Le long corridor',
    // Non traduit : doit partir en SOURCE (jamais une traduction à trous).
    texte_source: 'The corridor was endless.',
    texte_traduit: null,
    statut: 'erreur',
  },
];

const supabase = fauxSupabase({ chapitres: CHAPITRES });

async function inspecter(resultat: ResultatEpub, attendus: number) {
  const { octets } = resultat;
  verifier('OCF : mimetype premier, non compressé, contenu exact', resultat.ocf.ok, resultat.ocf.problemes.join(' ; '));
  verifier('nom de fichier en .epub', resultat.nomFichier.endsWith('.epub'), resultat.nomFichier);
  verifier(`nb de chapitres = ${attendus}`, resultat.nbChapitres === attendus, `reçu ${resultat.nbChapitres}`);

  const zip = await JSZip.loadAsync(octets);
  const noms = Object.keys(zip.files);
  verifier('container.xml présent', noms.includes('META-INF/container.xml'));
  verifier('content.opf présent', noms.includes('OEBPS/content.opf'));
  verifier('nav.xhtml (EPUB 3) présent', noms.includes('OEBPS/nav.xhtml'));
  verifier('toc.ncx (EPUB 2) présent', noms.includes('OEBPS/toc.ncx'));
  verifier(
    'un XHTML par chapitre',
    noms.filter((n) => n.startsWith('OEBPS/text/chapitre-')).length === attendus
  );

  const opf = await zip.file('OEBPS/content.opf')!.async('string');
  verifier('OPF : dc:title', opf.includes(`<dc:title>${LIVRE.titre}</dc:title>`));
  verifier('OPF : dc:creator', opf.includes('<dc:creator>Autrice Test</dc:creator>'));
  verifier('OPF : dc:language = fr (métadonnée FR)', opf.includes('<dc:language>fr</dc:language>'));
  verifier('OPF : identifiant unique', /<dc:identifier id="pub-id">urn:uuid:/.test(opf));
  verifier('OPF : nav déclarée', opf.includes('properties="nav"'));
  const itemrefs = [...opf.matchAll(/<itemref idref="([^"]+)"\/>/g)].map((m) => m[1]);
  verifier('spine : navigation par chapitre dans l’ordre', itemrefs.length === attendus);

  const nav = await zip.file('OEBPS/nav.xhtml')!.async('string');
  verifier(
    'nav : table des matières par chapitre',
    CHAPITRES.every((c) => nav.includes((c.titre as string).replace(/&/g, '&amp;')))
  );

  // XML bien formé sur tous les documents.
  const problemesXml: string[] = [];
  for (const n of noms.filter((x) => /\.(xhtml|opf|ncx|xml)$/.test(x))) {
    problemesXml.push(...verifierXmlBienForme(await zip.file(n)!.async('string'), n));
  }
  verifier('tous les fichiers XML sont bien formés', problemesXml.length === 0, problemesXml.join(' ; '));

  // Contenu : traduction pour les chapitres traduits, source sinon.
  const ch1 = await zip.file(noms.find((n) => n.includes('chapitre-01'))!)!.async('string');
  verifier('chapitre 1 : texte TRADUIT embarqué', ch1.includes('La nuit était froide.'));
  const ch3 = await zip.file(noms.find((n) => n.includes('chapitre-03'))!)!.async('string');
  verifier('chapitre 3 non traduit : SOURCE embarquée', ch3.includes('The corridor was endless.'));
}

async function main() {
  // ---------- 1. Mapping texte (traduit / source) ----------
  verifier(
    'texteChapitrePourExport : traduit quand le statut est « traduit »',
    texteChapitrePourExport(CHAPITRES[0] as never) === 'La nuit était froide.\n\nElle marchait vite.'
  );
  verifier(
    'texteChapitrePourExport : source si le chapitre est en erreur',
    texteChapitrePourExport(CHAPITRES[2] as never) === 'The corridor was endless.'
  );
  verifier(
    'texteChapitrePourExport : source si traduit sans texte',
    texteChapitrePourExport({
      position: 1,
      titre: 'x',
      texte_source: 'abc',
      texte_traduit: null,
      statut: 'traduit',
    }) === 'abc'
  );

  // ---------- 2. Chargement depuis le faux Supabase ----------
  const charge = await chargerChapitresEpub(supabase, LIVRE.id);
  verifier('chargerChapitresEpub : 3 chapitres dans l’ordre', charge.chapitres.length === 3);
  verifier('chargerChapitresEpub : 1 chapitre resté en source', charge.sources === 1, `reçu ${charge.sources}`);

  // ---------- 3. Génération complète + inspection ----------
  const resultat = await exporterEpubLivre(supabase, LIVRE, {
    date: '2026-10-02T10:00:00.000Z',
  });
  await inspecter(resultat, 3);
  console.log(`  taille : ${resultat.octets.length} octets (${(resultat.octets.length / 1024).toFixed(2)} Kio)`);

  // Écriture disque + vérification de la taille réelle.
  const dossier = join(process.cwd(), '.epub-test');
  mkdirSync(dossier, { recursive: true });
  const chemin = join(dossier, resultat.nomFichier);
  writeFileSync(chemin, resultat.octets);
  verifier('fichier .epub écrit sur disque', statSync(chemin).size === resultat.octets.length);

  // ---------- 4. Garde-fou : livre sans chapitre ----------
  const vide = fauxSupabase({ chapitres: [] });
  let refuse = false;
  try {
    await exporterEpubLivre(vide, { id: 'vide', titre: 'Vide' });
  } catch {
    refuse = true;
  }
  verifier('livre sans chapitre refusé', refuse);

  // ---------- 5. Relance des chapitres en erreur (P1.3) ----------
  verifier('nomFichierEpub : assainit le titre', nomFichierEpub({ titre: 'A/B:C*?' }) === 'A B C — traduction.epub');

  const erreurs = await chargerChapitresEnErreur(supabase, LIVRE.id);
  verifier('chargerChapitresEnErreur : ne renvoie que les chapitres en erreur', erreurs.length === 1);
  verifier('chargerChapitresEnErreur : le bon chapitre', (erreurs[0] as { titre: string }).titre.includes('corridor'));

  const aucun = await chargerChapitresEnErreur(
    fauxSupabase({ chapitres: [{ livre_id: 'x', statut: 'traduit' }] }),
    'x'
  );
  verifier('chargerChapitresEnErreur : tableau vide si rien à reprendre', aucun.length === 0);

  console.log(`\nFichier généré : ${chemin}`);
  if (echecs > 0) {
    console.error(`\n${echecs} échec(s).`);
    process.exit(1);
  }
  console.log('\nTous les tests de la chaîne « livre → EPUB » passent.');
}

main().catch((e) => {
  console.error('Erreur fatale :', e);
  process.exit(1);
});
