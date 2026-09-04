
// Test réel de /api/translate EN PRODUCTION via le chemin exact du lecteur
// (jeton Bearer). Compte test jetable créé via l'API publique Supabase.
import { readFileSync } from "node:fs";
const contenu = readFileSync(".env.local", "utf8");
const ligne = (c) => contenu.split("\n").find(l => l.trim().startsWith(c + "=")).split("=").slice(1).join("=").trim();
const BASE = "https://plume-ombres.vercel.app";
const URL = ligne("NEXT_PUBLIC_SUPABASE_URL");
const ANON = ligne("NEXT_PUBLIC_SUPABASE_ANON_KEY");

// 1) Compte test jetable (confirmation email désactivée → actif direct)
const EMAIL = `tradteste-${Date.now()}@example.com`;
const MDP = "PlumeTest.2026!";
const su = await fetch(`${URL}/auth/v1/signup`, {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: MDP, data: { pseudo: "Test Trad Pro" } }),
});
const suj = await su.json();
let token = suj.access_token;
if (!token) {
  // au cas où : re-login
  const lg = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: MDP }),
  });
  token = (await lg.json()).access_token;
  if (!token) { console.log("ÉCHEC compte test:", su.status, JSON.stringify(suj).slice(0,150)); process.exit(1); }
}
console.log("✓ Compte jetable prêt:", EMAIL);

async function appel(texte) {
  const t0 = Date.now();
  const r = await fetch(`${BASE}/api/translate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ texte, source: "en", cible: "fr" }),
  });
  const d = await r.json();
  return { status: r.status, ms: Date.now() - t0, d };
}

// 2) Segment court
const r1 = await appel("Isabella pressed her back against the cold stone wall of the alley, her heart hammering against her ribs.");
console.log(`\n[ COURT ] HTTP ${r1.status} · ${r1.ms} ms · fournisseur : ${r1.d.fournisseur}`);
console.log("FR :", r1.d.traduit ?? r1.d.erreur);

// 3) Segment ~1200 car (découpage en fragments + débit)
const long = "The night smelled of rain and regret. Isabella pressed her back against the cold stone wall of the alley, her heart hammering against her ribs like a caged bird. She had not planned to be here, not after what had happened at the docks, not after Marcus had looked at her with those cold gray eyes and told her that some doors, once opened, never close again. The city had swallowed her whole, its cobbled streets slick with the reflection of gas lamps that flickered like dying stars. Somewhere in the distance a church bell tolled the hour, and the sound rolled through the narrow lane like a funeral drum. She counted her coins, then counted them again. Twelve pence. Enough to reach the southern district, if the ferry still ran. The mist was thick tonight, curling around her ankles like the spirits of the drowned, and she told herself she would not think of them, not tonight, not when the clock was ticking and the debt was due.";
const r2 = await appel(long);
console.log(`\n[ ~1200 car ] HTTP ${r2.status} · ${r2.ms} ms (${(long.length/((r2.ms||1)/1000)).toLocaleString("fr")} car/s) · fournisseur : ${r2.d.fournisseur}`);
console.log("FR (début) :", (r2.d.traduit ?? r2.d.erreur).slice(0, 220));
