// ============================================================
// scripts/test-fallback-reel.mts — PREUVE RÉELLE de la chaîne
// de secours, avec PANNE PROVOQUÉE en pleine traduction.
//
// Aucun mock de fournisseur : on utilise la chaîne réelle
// (LibreTranslate auto-hébergé + Google non officiel + MyMemory).
// Un PROXY TCP local s'intercale devant LibreTranslate ; à un
// moment choisi, il passe en mode « coupé » (socket acceptée mais
// jamais de réponse) : le moteur privé devient injoignable EN
// PLEIN CHAPITRE. On vérifie alors :
//   • la BASCULE automatique vers les moteurs suivants ;
//   • la MESURE du temps perdu (timeout + moteurs en échec) ;
//   • l'IDEMPOTENCE : aucun segment traduit deux fois, aucun perdu,
//     la reprise ne retraduit pas les segments déjà faits.
//
// Usage : npx tsx scripts/test-fallback-reel.mts
// ============================================================

import { createServer, connect } from 'node:net';
import {
  ordreSecours,
  traduireAvecSecours,
  modePriveStrict,
} from '../lib/providers';

type Statut = 'en_attente' | 'fait' | 'erreur';
interface SegmentTest {
  id: string;
  source: string;
  statut: Statut;
  traduit: string | null;
  moteur: string | null;
}

const CHAPITRE: string[] = [
  'She pressed her back against the cold stone wall of the alley.',
  'The night smelled of rain and regret, and the city was silent.',
  'He looked at her with those gray eyes, and she looked away.',
  'Somewhere in the distance a church bell tolled the hour.',
  'The mist curled around her ankles like the spirits of the drowned.',
  'She counted her coins, then counted them again, twice.',
  'Every door she had ever opened still waited, patient and dark.',
  'He said that some doors, once opened, never close again.',
];

/** Proxy TCP : transparent, puis « coupé » (sockets existantes détruites). */
function creerProxy(port: number, ciblePort: number) {
  let coupe = false;
  // Sockets actives : à la coupure, on les DÉTRUIT aussi, sinon la
  // réutilisation de connexion (keep-alive) continuerait de joindre
  // le moteur comme s'il était vivant.
  const paires = new Set<{ client: import('node:net').Socket; amont: import('node:net').Socket }>();
  // Toutes les sockets acceptées (y compris « coupées », laissées
  // muettes) : indispensable pour pouvoir fermer le proxy proprement.
  const acceptees = new Set<import('node:net').Socket>();

  const serveur = createServer((client) => {
    acceptees.add(client);
    client.on('close', () => acceptees.delete(client));
    if (coupe) {
      // Socket acceptée SANS jamais répondre : seul le délai maximal
      // du client peut la débloquer.
      client.on('error', () => {
        /* ignore : coupure volontaire */
      });
      return;
    }
    client.setNoDelay(true);
    const amont = connect(ciblePort, '127.0.0.1');
    amont.setNoDelay(true);
    const paire = { client, amont };
    paires.add(paire);
    const retirer = () => paires.delete(paire);
    client.on('close', retirer);
    amont.on('close', retirer);
    client.pipe(amont);
    amont.pipe(client);
    client.on('error', () => amont.destroy());
    amont.on('error', () => client.destroy());
  });
  return {
    serveur,
    couper: () => {
      coupe = true;
      for (const { client, amont } of [...paires]) {
        client.destroy();
        amont.destroy();
      }
      paires.clear();
    },
    ecouter: () =>
      new Promise<void>((r) => serveur.listen(port, '127.0.0.1', () => r())),
    fermer: () =>
      new Promise<void>((r) => {
        for (const s of [...acceptees]) s.destroy();
        acceptees.clear();
        paires.clear();
        serveur.close(() => r());
      }),
  };
}

function segments(chapitre: string[]): SegmentTest[] {
  return chapitre.map((source, i) => ({
    id: `seg-${i}`,
    source,
    statut: 'en_attente' as Statut,
    traduit: null,
    moteur: null,
  }));
}

interface ResultatScenario {
  nom: string;
  total: number;
  faits: number;
  parMoteur: Record<string, number>;
  doublons: number;
  perdus: number;
  premierApresCoupureMs: number | null;
  tentativesParMoteur: Record<string, number>;
  dureeTotaleMs: number;
}

/** Traduit les segments en file (reprise : seuls en_attente/erreur). */
async function traduireFile(
  store: SegmentTest[],
  envoyer: Set<string>,
  journal: { segment: string; dureeMs: number; essais: number; fournisseur?: string }[],
  onSuccess: (n: number) => void
): Promise<ResultatScenario> {
  const parMoteur: Record<string, number> = {};
  const tentativesParMoteur: Record<string, number> = {};
  let doublons = 0;
  let premierApresCoupureMs: number | null = null;
  let nbSucces = 0;
  const debut = Date.now();

  for (const s of store) {
    if (s.statut === 'fait') continue; // idempotence : on saute
    if (s.statut !== 'en_attente' && s.statut !== 'erreur') continue;

    // Détection de double envoi : un même segment ne doit jamais
    // être soumis deux fois dans un même lot.
    if (envoyer.has(s.id)) doublons += 1;
    envoyer.add(s.id);

    const t0 = Date.now();
    try {
      const r = await traduireAvecSecours(s.source, { source: 'en', cible: 'fr' });
      s.statut = 'fait';
      s.traduit = r.traduit;
      s.moteur = r.fournisseur;
      parMoteur[r.fournisseur] = (parMoteur[r.fournisseur] ?? 0) + 1;
      // Tentatives « perdues » sur les moteurs précédents (essais-1).
      const perdusHop = Math.max(0, r.essais - 1);
      if (perdusHop > 0) {
        tentativesParMoteur['_echecs_avant_succes'] =
          (tentativesParMoteur['_echecs_avant_succes'] ?? 0) + perdusHop;
      }
      const dureeMs = Date.now() - t0;
      journal.push({ segment: s.id, dureeMs, essais: r.essais, fournisseur: r.fournisseur });
      if (premierApresCoupureMs === null && r.fournisseur !== 'libretranslate') {
        premierApresCoupureMs = dureeMs;
      }
      nbSucces += 1;
      onSuccess(nbSucces);
    } catch (e) {
      s.statut = 'erreur';
      journal.push({ segment: s.id, dureeMs: Date.now() - t0, essais: 0 });
    }
  }

  const faits = store.filter((s) => s.statut === 'fait').length;
  return {
    nom: '',
    total: store.length,
    faits,
    parMoteur,
    doublons,
    perdus: store.length - faits,
    premierApresCoupureMs,
    tentativesParMoteur,
    dureeTotaleMs: Date.now() - debut,
  };
}

async function principal() {
  console.log('=== PREUVE RÉELLE — CHAÎNE DE SECOURS + PANNE PROVOQUÉE ===\n');
  console.log(`ordre de la chaîne : ${ordreSecours().join(' → ')}`);
  console.log(`mode privé strict   : ${modePriveStrict()}`);

  // Délai de bascule : on laisse une marge confortable au moteur privé
  // (un moteur sain répond en quelques dizaines de ms) tout en bornant
  // strictement l'attente quand le moteur est coupé.
  process.env.TRANSLATOR_FALLBACK_TIMEOUT_MS = '2000';

  const proxy = creerProxy(5990, 5000);
  await proxy.ecouter();
  process.env.LIBRETRANSLATE_URL = 'http://127.0.0.1:5990';
  console.log('proxy 127.0.0.1:5990 → LibreTranslate 127.0.0.1:5000\n');

  // Préchauffage : la toute première connexion TCP au proxy est lente
  // (établissement à froid) ; on l'écarte des mesures pour ne pas
  // confondre « latence de démarrage » et « bascule ».
  {
    const { fournisseurParId } = await import('../lib/providers');
    const t0 = Date.now();
    await fournisseurParId('libretranslate')
      .traduire('warm up', { source: 'en', cible: 'fr' })
      .catch(() => undefined);
    console.log(`préchauffage du moteur privé : ${Date.now() - t0} ms\n`);
  }

  const scenarios: ResultatScenario[] = [];

  // ---------- SCÉNARIO A : coupure EN PLEIN CHAPITRE ----------
  {
    const store = segments(CHAPITRE);
    const envoyer = new Set<string>();
    const journal: { segment: string; dureeMs: number; essais: number; fournisseur?: string }[] = [];

    const r = await traduireFile(store, envoyer, journal, (n) => {
      if (n === 3) {
        proxy.couper();
        console.log('   ⚡ coupure du moteur privé (proxy) APRÈS 3 segments\n');
      }
    });
    r.nom = 'A — panne en cours de chapitre';

    console.log('segments :');
    for (const j of journal) {
      console.log(
        `   ${j.segment} → ${j.fournisseur ?? 'ÉCHEC'} en ${j.dureeMs} ms (${j.essais} moteur(s) essayé(s))`
      );
    }
    const premier = store.slice(0, 3).map((s) => s.moteur);
    const apres = store.slice(3).map((s) => s.moteur);
    console.log(`\n   moteurs (3 premiers) : ${premier.join(', ')}`);
    console.log(`   moteurs (après coupe): ${apres.join(', ')}`);

    // Vérifications
    if (r.faits !== r.total) throw new Error(`A: ${r.total - r.faits} segment(s) perdu(s)`);
    if (r.doublons !== 0) throw new Error(`A: ${r.doublons} doublon(s)`);
    const tousTraduitsNonVides = store.every((s) => (s.traduit ?? '').trim().length > 0);
    if (!tousTraduitsNonVides) throw new Error('A: un segment traduit est vide');
    if (premier.some((m) => m !== 'libretranslate'))
      throw new Error('A: un des 3 premiers n’a pas utilisé le moteur privé');
    if (apres.some((m) => m === null || m === 'libretranslate'))
      throw new Error('A: la bascule n’a pas eu lieu après la coupure');
    console.log('   ✓ aucun perdu, aucun doublon, bascule automatique confirmée\n');
    scenarios.push(r);
  }

  // ---------- SCÉNARIO B : REPRISE (idempotence) ----------
  {
    // Chapitre interrompu : 3 segments déjà traduits par le privé.
    const store = segments(CHAPITRE);
    for (const s of store.slice(0, 3)) {
      s.statut = 'fait';
      s.traduit = '(déjà traduit)';
      s.moteur = 'libretranslate';
    }
    const envoyer = new Set<string>();
    const journal: { segment: string; dureeMs: number; essais: number; fournisseur?: string }[] = [];

    const r = await traduireFile(store, envoyer, journal, () => {});
    r.nom = 'B — reprise après interruption';

    console.log('reprise : segments ENVOYÉS au moteur :');
    for (const j of journal) {
      console.log(`   ${j.segment} → ${j.fournisseur} (${j.dureeMs} ms)`);
    }
    const reTraduits = ['seg-0', 'seg-1', 'seg-2'].filter((id) => envoyer.has(id));
    console.log(`\n   segments déjà faits re-envoyés : ${reTraduits.length} (attendu 0)`);
    if (reTraduits.length !== 0) throw new Error('B: reprise a retraduit un segment');
    if (envoyer.size !== 5) throw new Error(`B: ${envoyer.size} segments envoyés (attendu 5)`);
    if (r.doublons !== 0) throw new Error('B: doublon détecté');
    if (r.faits !== r.total) throw new Error('B: segment perdu à la reprise');
    console.log('   ✓ reprise sans double traduction, aucun segment perdu\n');
    scenarios.push(r);
  }

  await proxy.fermer();

  // ---------- SYNTHÈSE ----------
  const resume = {
    ordre: ordreSecours().join(' → '),
    timeoutMs: 2000,
    scenarios: scenarios.map((s) => ({
      nom: s.nom,
      segments: s.total,
      faits: s.faits,
      perdus: s.perdus,
      doublons: s.doublons,
      parMoteur: s.parMoteur,
      premierApresCoupureMs: s.premierApresCoupureMs,
      dureeTotaleMs: s.dureeTotaleMs,
    })),
  };
  console.log('RÉSUMÉ_JSON ' + JSON.stringify(resume));
  console.log('\n=== TOUTES LES VÉRIFICATIONS RÉELLES SONT PASSÉES ===');
}

principal().catch((e) => {
  console.error('ÉCHEC :', e instanceof Error ? e.message : e);
  process.exit(1);
});
