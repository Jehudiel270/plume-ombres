// ============================================================
// scripts/verifier-sections-e2e.mjs — Épreuve de bout en bout des
// sections d'administration, avec un VRAI compte connecté.
//
// 1. crée un compte jetable (@example.invalid : aucun courriel réel) ;
// 2. lui donne un profil administrateur, puis ne lui ouvre QUE la
//    section « paiements » (par la fonction de réglage, comme le fait
//    le super-administrateur depuis l'interface) ;
// 3. se connecte avec son mot de passe et interroge les RPC comme le
//    ferait le navigateur ;
// 4. vérifie qu'il ne peut PAS élargir ses propres droits ;
// 5. vérifie le DÉFAUT FERMÉ (aucune section réglée = aucun accès) ;
// 6. supprime tout (compte, profil, réglages en cascade).
// ============================================================

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const service = { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE };
const json = { ...service, 'Content-Type': 'application/json' };

let echecs = 0;
function verifier(intitule, condition, detail = '') {
  console.log(`${condition ? 'OK  ' : 'ECHEC'} ${intitule}${detail ? ' -> ' + detail : ''}`);
  if (!condition) echecs += 1;
}

const appelRpc = async (entetes, nom, args = {}) => {
  const r = await fetch(`${URL_BASE}/rest/v1/rpc/${nom}`, {
    method: 'POST',
    headers: entetes,
    body: JSON.stringify(args),
  });
  let corps = null;
  try {
    corps = await r.json();
  } catch {
    corps = null;
  }
  return { status: r.status, corps };
};

const courriel = `secu-sections-${Date.now()}@example.invalid`;
const motDePasse = 'Test-' + Math.random().toString(36).slice(2) + '-Aa1!';
let idCompte = null;

try {
  // 1. Compte jetable (déjà confirmé, aucun envoi de courriel réel).
  const creation = await fetch(`${URL_BASE}/auth/v1/admin/users`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ email: courriel, password: motDePasse, email_confirm: true }),
  });
  const cree = await creation.json();
  idCompte = cree.id ?? null;
  verifier('création du compte jetable', creation.status === 200 && !!idCompte, String(creation.status));
  if (!idCompte) throw new Error('compte non créé');

  // 2. Profil administrateur (les comptes créés par l'API d'admin n'en
  //    reçoivent pas : on l'écrit explicitement, idempotent).
  const profil = await fetch(`${URL_BASE}/rest/v1/profiles`, {
    method: 'POST',
    headers: { ...json, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: idCompte, pseudo: 'test-sections', role: 'admin' }),
  });
  verifier(
    'profil administrateur écrit',
    [200, 201, 204].includes(profil.status),
    String(profil.status)
  );

  // 3. Réglage : une seule section ouverte (fonction de réglage, service_role).
  const ouverture = await appelRpc(json, 'definir_sections_admin', {
    p_cible: idCompte,
    p_sections: ['paiements'],
  });
  verifier(
    'réglage : seule la section paiements',
    ouverture.status === 200 && JSON.stringify(ouverture.corps) === '["paiements"]',
    JSON.stringify(ouverture.corps)
  );

  // 4. Connexion réelle (mot de passe) pour obtenir un jeton de session.
  const connexion = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: courriel, password: motDePasse }),
  });
  const session = await connexion.json();
  const jeton = session.access_token;
  verifier('connexion par mot de passe', connexion.status === 200 && !!jeton, String(connexion.status));
  if (!jeton) throw new Error('pas de jeton');

  const moi = { apikey: ANON, Authorization: 'Bearer ' + jeton, 'Content-Type': 'application/json' };
  const rpc = (nom, args = {}) => appelRpc(moi, nom, args);

  const mesSections = await rpc('mes_sections');
  verifier(
    'mes_sections ne renvoie que paiements',
    mesSections.status === 200 &&
      Array.isArray(mesSections.corps) &&
      mesSections.corps.length === 1 &&
      mesSections.corps[0] === 'paiements',
    JSON.stringify(mesSections.corps)
  );

  const sPaie = await rpc('section_autorisee', { p_section: 'paiements' });
  verifier('section paiements autorisée', sPaie.corps === true, String(sPaie.corps));

  const sComptes = await rpc('section_autorisee', { p_section: 'comptes' });
  verifier('section comptes REFUSÉE', sComptes.corps === false, String(sComptes.corps));

  const audience = await rpc('admin_stats_visites', { p_jours: 30 });
  verifier(
    "audience REFUSÉE quand la section n'est pas ouverte",
    audience.status >= 400,
    String(audience.status)
  );

  // La même section, ouverte : l'appel doit alors passer.
  await appelRpc(json, 'definir_sections_admin', {
    p_cible: idCompte,
    p_sections: ['paiements', 'audience'],
  });
  const audienceOuverte = await rpc('admin_stats_visites', { p_jours: 30 });
  verifier(
    "audience autorisée une fois la section ouverte",
    audienceOuverte.status === 200,
    String(audienceOuverte.status)
  );
  await appelRpc(json, 'definir_sections_admin', { p_cible: idCompte, p_sections: ['paiements'] });

  // 5. Escalade : un simple admin ne doit pas pouvoir redistribuer les sections.
  const escalade = await rpc('definir_sections_admin', {
    p_cible: idCompte,
    p_sections: ['comptes', 'abonnements', 'paiements', 'audience', 'systeme'],
  });
  verifier(
    'un admin ne peut pas élargir ses propres droits',
    escalade.status >= 400,
    String(escalade.status)
  );

  const relecture = await rpc('mes_sections');
  verifier(
    'ses droits sont restés inchangés',
    Array.isArray(relecture.corps) && relecture.corps.length === 1,
    JSON.stringify(relecture.corps)
  );

  // 6. Défaut FERMÉ : aucune section réglée = aucun accès.
  await appelRpc(json, "definir_sections_admin", { p_cible: idCompte, p_sections: [] });
  const apresFermeture = await rpc('mes_sections');
  verifier(
    'sans section réglée, aucun accès',
    Array.isArray(apresFermeture.corps) && apresFermeture.corps.length === 0,
    JSON.stringify(apresFermeture.corps)
  );

  const comptesFermes = await rpc('section_autorisee', { p_section: 'paiements' });
  verifier('section paiements fermée aussi', comptesFermes.corps === false, String(comptesFermes.corps));

  const audienceFermee = await rpc('admin_stats_visites', { p_jours: 30 });
  verifier("audience refusée quand rien n'est ouvert", audienceFermee.status >= 400, String(audienceFermee.status));
} catch (erreur) {
  console.error('ÉPREUVE INTERROMPUE :', erreur.message);
  echecs += 1;
} finally {
  if (idCompte) {
    const nettoyage = await fetch(`${URL_BASE}/auth/v1/admin/users/${idCompte}`, {
      method: 'DELETE',
      headers: service,
    });
    console.log('nettoyage du compte jetable :', nettoyage.status);
  }
}

console.log(echecs === 0 ? '\nRÉSULTAT : toutes les épreuves passent' : `\nRÉSULTAT : ${echecs} échec(s)`);
process.exit(echecs === 0 ? 0 : 1);
