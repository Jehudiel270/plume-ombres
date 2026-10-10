// Preuve RÉELLE de la chaîne e-mail :
//   A. dialogue SMTP direct avec Brevo (STARTTLS + AUTH LOGIN + envoi) ;
//   B. déclenchement du parcours produit « mot de passe oublié » via
//      l'API Supabase (l'e-mail doit partir par le SMTP configuré).
//
// N'affiche JAMAIS le mot de passe SMTP.
// Usage : node scripts/_test-smtp-brevo.mjs
import { readFileSync } from 'node:fs';
import net from 'node:net';
import tls from 'node:tls';

const env = {};
for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=(.*)$/.exec(l);
  if (m) env[m[1]] = m[2].trim();
}

const HOTE = env.SMTP_HOST;
const PORT = Number(env.SMTP_PORT || 587);
const USER = env.SMTP_USER;
const PASS = env.SMTP_PASSWORD;
const EXPEDITEUR = env.SMTP_EXPEDITEUR;
const NOM = env.SMTP_EXPEDITEUR_NOM || "Plume d'Ombres";
const DEST = process.argv[2] || EXPEDITEUR;

if (!HOTE || !USER || !PASS || !EXPEDITEUR) {
  console.error('SMTP_HOST / SMTP_USER / SMTP_PASSWORD / SMTP_EXPEDITEUR requis dans .env.local');
  process.exit(1);
}

// ------------------------------------------------------------
// A. Dialogue SMTP réel
// ------------------------------------------------------------
function creerDialogue(socket) {
  let tampon = '';
  const attentes = [];
  socket.on('data', (d) => {
    tampon += d.toString('utf8');
    for (let i = attentes.length - 1; i >= 0; i -= 1) {
      const attendu = attentes[i];
      // Une réponse SMTP complète : une ligne finale « 250 texte » (l'espace
      // distingue la dernière ligne d'une réponse multiligne « 250- »).
      const re = new RegExp(`^${attendu.code}[ ]`, 'm');
      if (re.test(tampon)) {
        const texte = tampon;
        tampon = '';
        attentes.splice(i, 1);
        attendu.resolve(texte.trim());
      }
    }
  });
  return (code, commande) =>
    new Promise((resolve, reject) => {
      const minuteur = setTimeout(() => reject(new Error(`délai dépassé en attendant ${code}`)), 20000);
      attentes.push({
        code,
        resolve: (t) => {
          clearTimeout(minuteur);
          resolve(t);
        },
      });
      if (commande) socket.write(commande.endsWith('\r\n') ? commande : `${commande}\r\n`);
    });
}

const etapes = [];
const verifier = (nom, ok, detail = '') => {
  etapes.push({ nom, ok, detail });
  console.log(`${ok ? 'OK ' : 'KO '} ${nom}${detail ? ' — ' + detail : ''}`);
};

async function testSmtp() {
  console.log('— A. Dialogue SMTP réel avec', HOTE, '—');
  const brute = net.connect({ host: HOTE, port: PORT });
  const attendre = creerDialogue(brute);
  let socket = brute;

  await new Promise((resolve, reject) => {
    brute.once('connect', resolve);
    brute.once('error', reject);
  });
  const accueil = await attendre(220);
  console.log('   ' + accueil.split('\r\n')[0]);

  let ehlo = await attendre(250, 'EHLO plume-ombres.local');
  const annonceStartTls = /STARTTLS/i.test(ehlo);
  verifier('le serveur annonce STARTTLS', annonceStartTls);

  await attendre(220, 'STARTTLS');
  const securise = tls.connect({ socket: brute, servername: HOTE });
  await new Promise((resolve, reject) => {
    securise.once('secureConnect', resolve);
    securise.once('error', reject);
  });
  socket = securise;
  const attendre2 = creerDialogue(securise);
  ehlo = await attendre2(250, 'EHLO plume-ombres.local');
  verifier('connexion TLS établie (STARTTLS)', !!securise.getCipher(), securise.getCipher()?.name);

  await attendre2(334, 'AUTH LOGIN');
  await attendre2(334, Buffer.from(USER, 'utf8').toString('base64'));
  const auth = await attendre2(235, Buffer.from(PASS, 'utf8').toString('base64'));
  verifier('authentification SMTP acceptée par Brevo', true, auth.split('\r\n').pop());

  await attendre2(250, `MAIL FROM:<${EXPEDITEUR}>`);
  const rcpt = await attendre2(250, `RCPT TO:<${DEST}>`);
  verifier('destinataire accepté', true, `${DEST} — ${rcpt.split('\r\n').pop()}`);

  await attendre2(354, 'DATA');
  const corps = [
    `From: ${NOM} <${EXPEDITEUR}>`,
    `To: <${DEST}>`,
    'Subject: [Plume d Ombres] Test de la chaine e-mail de production',
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    "Test automatique : l'envoi d'e-mails de Plume d'Ombres fonctionne.",
    '',
    'Ce message a ete envoye par le script de verification _test-smtp-brevo.mjs',
    'pour valider le relais SMTP Brevo avant le lancement.',
    '',
  ].join('\r\n');
  const fin = await attendre2(250, `${corps}\r\n.`);
  verifier('message ACCEPTÉ par le relais (250)', true, fin.split('\r\n').pop());
  await attendre2(221, 'QUIT').catch(() => undefined);
  socket.end();
}

// ------------------------------------------------------------
// B. Parcours produit « mot de passe oublié »
// ------------------------------------------------------------
async function testParcours() {
  console.log('\n— B. Parcours produit « mot de passe oublié » —');
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const cible = process.argv[3] || 'dossoucarrel@gmail.com';
  const r = await fetch(`${url}/auth/v1/recover`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: cible,
      redirect_to: 'https://plume-ombres.vercel.app/auth/confirmer?suivant=/nouveau-mot-de-passe',
    }),
  });
  const texte = await r.text();
  verifier(
    `l'API Supabase accepte la demande de réinitialisation pour ${cible}`,
    r.ok,
    `HTTP ${r.status} ${texte.slice(0, 200)}`
  );
}

try {
  await testSmtp();
} catch (e) {
  verifier('dialogue SMTP', false, e.message);
}
try {
  await testParcours();
} catch (e) {
  verifier('parcours produit', false, e.message);
}

const echecs = etapes.filter((x) => !x.ok).length;
console.log(`\n${echecs === 0 ? '✓' : '✗'} ${etapes.length - echecs}/${etapes.length} vérifications OK`);
process.exitCode = echecs === 0 ? 0 : 1;
