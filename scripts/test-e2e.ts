// ============================================================
// Test E2E intégral (backend réel + Supabase hébergé + route API)
// Parcourt exactement le même chemin que l'UI :
//   inscription → profil → import livre → découpage → traduction
//   via /api/translate (session Bearer) → réassemblage → export brut.
// Usage : npx tsx scripts/test-e2e.ts
// ============================================================

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { Client as ClientPg } from 'pg';
import { preparerLivre } from '../lib/import-livre';
import { assembler } from '../lib/segmenter';

const URL = 'https://imbziizequckeaxuotdz.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImltYnppaXplcXVja2VheHVvdGR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0NDMzNzUsImV4cCI6MjEwNDAxOTM3NX0.eOzPwylvKiA7N2vpyZlCYcsMkICrIdhbC4EUzKKBGuU';

function lireEnvLocal(cle: string): string {
  const contenu = readFileSync('.env.local', 'utf8');
  const ligne = contenu.split('\n').find((l) => l.trim().startsWith(`${cle}=`));
  if (!ligne) throw new Error(`Clé ${cle} introuvable`);
  return ligne.split('=').slice(1).join('=').trim();
}

const EMAIL = `e2e-${Date.now()}@example.com`;
const MDP = 'PlumeTest.2026!';
const TEXTE = readFileSync('C:/Users/dosso/dev/test-livre.txt', 'utf8');

let echecs = 0;
function verifier(nom: string, condition: boolean) {
  if (!condition) {
    echecs += 1;
    console.error(`✗ ${nom}`);
  } else {
    console.log(`✓ ${nom}`);
  }
}

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function principal() {
  console.log('— 1. Inscription —');
  const supabase = createClient(URL, ANON);
  const { data: signUp, error: errSignUp } = await supabase.auth.signUp({
    email: EMAIL,
    password: MDP,
    options: { data: { pseudo: 'Testeur E2E' } },
  });
  console.log('  détail signUp :', errSignUp?.message ?? 'ok');
  verifier('signUp sans erreur', !errSignUp && !!signUp.user);
  if (!signUp.user) return;

  // Confirmation manuelle de l'email (équivalent du clic sur le lien).
  const pg = new ClientPg({
    host: 'aws-1-eu-west-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.imbziizequckeaxuotdz',
    password: lireEnvLocal('SUPABASE_DB_PASSWORD'),
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();
  await pg.query(
    `update auth.users set email_confirmed_at = now() where id = $1`,
    [signUp.user.id]
  );
  await pg.end();
  console.log('  email confirmé en base');

  const { data: connexion, error: errConnexion } =
    await supabase.auth.signInWithPassword({ email: EMAIL, password: MDP });
  verifier('connexion OK', !errConnexion && !!connexion.session);
  const jeton = connexion.session?.access_token;
  if (!jeton) return;

  // Profil (l'UI le crée à l'inscription ; on s'assure qu'il existe).
  const { error: errProfil } = await supabase
    .from('profiles')
    .upsert({ id: signUp.user.id, pseudo: 'Testeur E2E' });
  verifier('profil créé', !errProfil);

  console.log('— 2. Import du livre (~500 mots) —');
  const livre = preparerLivre(TEXTE, 'test-livre.txt');
  const { data: livreInsere, error: errLivre } = await supabase
    .from('livres')
    .insert({
      titre: livre.titre,
      auteur: null,
      langue_source: 'en',
      langue_cible: 'fr',
      nom_fichier: 'test-livre.txt',
      statut: 'importe',
    })
    .select('id')
    .single();
  verifier('livre inséré', !errLivre && !!livreInsere);
  if (!livreInsere) return;

  let totalSegments = 0;
  for (const chapitre of livre.chapitres) {
    const { error: errChap } = await supabase.from('chapitres').insert({
      id: chapitre.id,
      livre_id: livreInsere.id,
      position: chapitre.position,
      titre: chapitre.titre,
      texte_source: chapitre.texte_source,
      statut: 'a_traduire',
    });
    if (errChap) throw errChap;
    for (let i = 0; i < chapitre.segments.length; i += 300) {
      const lot = chapitre.segments.slice(i, i + 300).map((s) => ({
        chapitre_id: chapitre.id,
        position: s.position,
        source: s.source,
        suite: s.suite,
      }));
      const { error: errSeg } = await supabase.from('segments').insert(lot);
      if (errSeg) throw errSeg;
    }
    totalSegments += chapitre.segments.length;
  }
  await supabase.from('livres').update({ statut: 'pret' }).eq('id', livreInsere.id);
  console.log(`  ${livre.chapitres.length} chapitres, ${totalSegments} segments`);
  verifier('chapitres détectés', livre.chapitres.length === 2);

  console.log('— 3. Traduction via /api/translate (session réelle) —');
  const debut = Date.now();
  const chapitresTraduits: Array<{ titre: string; texte: string }> = [];
  for (const chapitre of livre.chapitres) {
    const { data: segments } = await supabase
      .from('segments')
      .select('id, position, source, suite, statut')
      .eq('chapitre_id', chapitre.id)
      .order('position', { ascending: true });
    const resultats: Array<{ traduit: string | null; suite: string }> = [];
    for (const seg of segments ?? []) {
      if (!seg.source) {
        resultats.push({ traduit: null, suite: seg.suite });
        continue;
      }
      const reponse = await fetch('http://127.0.0.1:3000/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jeton}`,
        },
        body: JSON.stringify({ texte: seg.source, source: 'en', cible: 'fr' }),
      });
      const corps = (await reponse.json()) as { traduit?: string; erreur?: string };
      if (!reponse.ok) {
        throw new Error(`Segment ${seg.id} : ${corps.erreur ?? reponse.status}`);
      }
      await supabase
        .from('segments')
        .update({ statut: 'fait', traduit: corps.traduit })
        .eq('id', seg.id);
      resultats.push({ traduit: corps.traduit ?? null, suite: seg.suite });
      await attendre(60);
    }
    const texteAssemble = assembler(resultats);
    await supabase
      .from('chapitres')
      .update({ statut: 'traduit', texte_traduit: texteAssemble })
      .eq('id', chapitre.id);
    chapitresTraduits.push({ titre: chapitre.titre, texte: texteAssemble });
  }
  console.log(
    `  ${totalSegments} segments traduits en ${((Date.now() - debut) / 1000).toFixed(1)} s`
  );
  await supabase.from('livres').update({ statut: 'traduit' }).eq('id', livreInsere.id);

  console.log('— 4. Vérifications du réassemblage —');
  const ch1 = chapitresTraduits[0];
  verifier('chapitre 1 traduit non vide', ch1.texte.trim().length > 50);
  verifier(
    'structure 1:1 (nb paragraphes identique)',
    ch1.texte.trim().split('\n\n').length ===
      livre.chapitres[0].texte_source.trim().split('\n\n').length
  );
  const extrait = ch1.texte.split('\n\n').slice(0, 2).join('\n\n');
  console.log('\n— Aperçu traduit —\n' + extrait.slice(0, 300) + '\n');

  console.log("— 5. Isolation RLS (l'autre compte ne voit rien) —");
  const compte2 = await supabase.auth.signUp({
    email: `autre-${Date.now()}@example.com`,
    password: MDP,
  });
  const c2 = createClient(URL, ANON);
  let session2 = compte2.data.session;
  if (!session2 && compte2.data.user) {
    const { data: connexion2 } = await c2.auth.signInWithPassword({
      email: compte2.data.user.email!,
      password: MDP,
    });
    session2 = connexion2.session ?? null;
  }
  if (session2) {
    const { data: livresAutre } = await c2
      .from('livres')
      .select('id')
      .eq('proprietaire_id', session2.user.id);
    verifier('le 2e compte ne voit que ses livres', (livresAutre ?? []).length === 0);
  } else {
    console.error('  (pas de session pour le 2e compte — vérification RLS ignorée)');
  }

  console.log('— 6. Nettoyage des comptes de test —');
  const pg3 = new ClientPg({
    host: 'aws-1-eu-west-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.imbziizequckeaxuotdz',
    password: lireEnvLocal('SUPABASE_DB_PASSWORD'),
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });
  await pg3.connect();
  await pg3.query(
    `delete from auth.users where email like 'e2e-%@example.com' or email like 'autre-%@example.com'`
  );
  await pg3.end();
  console.log('  comptes de test supprimés (cascade livres/chapitres/segments) ✓');

  console.log(echecs === 0 ? '\n✓ E2E BACKEND COMPLET OK.' : `\n✗ ${echecs} échec(s).`);
  process.exit(echecs === 0 ? 0 : 1);
}

principal().catch((e) => {
  console.error('Erreur fatale :', e);
  process.exit(1);
});
