/**
 * Répare les titres de chapitres déjà importés depuis un EPUB.
 *
 * Pourquoi : l'ancien lecteur d'EPUB numérotait les fragments sans titre
 * d'après leur position dans le spine (`Chapitre 3`, `Chapitre 6`, …) alors
 * que le vrai titre (« Chapter One », « Prologue ») était écrit en clair
 * dans le texte. Les nouveaux imports sont corrigés dans lib/import-epub.ts ;
 * ce script rattrape les livres déjà en base.
 *
 * Il ne touche QU'AUX titres : aucun mot du texte n'est modifié, et un
 * chapitre dont on ne sait pas lire le titre garde le sien.
 *
 * Usage :
 *   npx tsx scripts/reparer-titres-chapitres.ts            (simulation)
 *   npx tsx scripts/reparer-titres-chapitres.ts --appliquer
 */
import { titreEtCorpsDuFragment } from '../lib/import-epub';
import { creerClient } from './connexion-db';

/** Un titre qui n'est qu'un numéro de position : « Chapitre 3 ». */
const TITRE_PLACEHOLDER = /^chapitre\s+\d+$/i;

async function main() {
  const appliquer = process.argv.includes('--appliquer');
  const client = creerClient();
  await client.connect();
  try {
    const { rows } = await client.query<{
      id: string;
      livre_id: string;
      titre_livre: string;
      position: number;
      titre: string;
      texte_source: string;
    }>(`
      select c.id, c.livre_id, l.titre as titre_livre, c.position, c.titre,
             c.texte_source
        from chapitres c
        join livres l on l.id = c.livre_id
       where c.titre ~* '^chapitre[[:space:]]+[0-9]+$'
       order by l.titre, c.position
    `);

    let corriges = 0;
    let inconnus = 0;
    let livreCourant = '';
    for (const ligne of rows) {
      const lu = titreEtCorpsDuFragment(ligne.texte_source ?? '', ligne.titre_livre);
      const titre = lu.titre.trim();
      if (livreCourant !== ligne.titre_livre) {
        livreCourant = ligne.titre_livre;
        console.log(`\n${livreCourant}`);
      }
      if (!titre || TITRE_PLACEHOLDER.test(titre)) {
        inconnus += 1;
        console.log(`  #${ligne.position}  « ${ligne.titre} »  → (titre illisible)`);
        continue;
      }
      corriges += 1;
      console.log(`  #${ligne.position}  « ${ligne.titre} »  →  « ${titre} »`);
      if (appliquer) {
        await client.query('update chapitres set titre = $1 where id = $2', [
          titre,
          ligne.id,
        ]);
      }
    }

    console.log(
      `\n${corriges} titre(s) ${appliquer ? 'corrigé(s)' : 'à corriger'}, ` +
        `${inconnus} inchangé(s).`
    );
    if (!appliquer && corriges > 0) {
      console.log('Relance avec --appliquer pour écrire en base.');
    }
  } finally {
    await client.end();
  }
}

void main();
