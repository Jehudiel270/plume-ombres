// Benchmark du débit réel du moteur actif (LibreTranslate local).
import { FournisseurLibreTranslate } from '../lib/providers/libretranslate';

const phrase =
  'She pressed her back against the cold stone wall of the alley, her heart hammering against her ribs like a caged bird, and she knew that tonight would change everything forever. ';
const MOYEN = phrase.repeat(6); // ~ 700 car.
const GROS = phrase.repeat(40); // ~ 4600 car.

async function mesurer(nom: string, texte: string) {
  const f = new FournisseurLibreTranslate();
  const n = 3;
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    await f.traduire(texte, { source: 'en', cible: 'fr' });
  }
  const ms = (Date.now() - t0) / n;
  const charsS = Math.round(texte.length / (ms / 1000));
  console.log(
    `${nom}: ${texte.length} car. en ${ms.toFixed(0)} ms → ${charsS} car/s (séquentiel)`
  );
  return charsS;
}

async function principal() {
  console.log('— Débit LibreTranslate local (séquentiel) —');
  await mesurer('paragraphe ~700 car', MOYEN);
  await mesurer('gros bloc ~4600 car', GROS);

  // Parallélisme simulé 4 requêtes simultanées sur petits textes
  const f = new FournisseurLibreTranslate();
  const t0 = Date.now();
  const lots = Array.from({ length: 12 }, () => phrase.repeat(5));
  await Promise.all(lots.map((t) => f.traduire(t, { source: 'en', cible: 'fr' })));
  const totalChars = lots.reduce((n, t) => n + t.length, 0);
  const charsS = Math.round(totalChars / ((Date.now() - t0) / 1000));
  console.log(`12 requêtes parallèles (~${Math.round(totalChars / 12)} car. chacune) → ${charsS} car/s`);
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
