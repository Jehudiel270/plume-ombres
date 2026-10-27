// Vérification post-réparation de chapitres.texte_source.
// Compare, chapitre par chapitre, le texte stocké et la reconstitution
// depuis les segments (même règle : source || suite, ordre position).
const u = process.env.NEXT_PUBLIC_SUPABASE_URL;
const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: k, Authorization: `Bearer ${k}` };

const chapitres = await (
  await fetch(`${u}/rest/v1/chapitres?select=id,livre_id,titre,texte_source&limit=5000`, { headers: h })
).json();

const vides = chapitres.filter((c) => !c.texte_source || c.texte_source.length === 0);
const total = chapitres.reduce((n, c) => n + (c.texte_source?.length ?? 0), 0);
console.log(`chapitres=${chapitres.length}  vides=${vides.length}  caracteres_totaux=${total}`);

// Contrôle d'égalité sur 5 chapitres non vides tirés au hasard.
const echantillon = chapitres
  .filter((c) => (c.texte_source ?? '').length > 500)
  .sort(() => 0.5 - Math.random())
  .slice(0, 5);

let identiques = 0;
for (const c of echantillon) {
  const segs = await (
    await fetch(
      `${u}/rest/v1/segments?chapitre_id=eq.${c.id}&select=position,source,suite&order=position.asc&limit=5000`,
      { headers: h }
    )
  ).json();
  const reconstitue = segs.map((s) => `${s.source ?? ''}${s.suite ?? ''}`).join('');
  const pareil = reconstitue.trim() === (c.texte_source ?? '').trim();
  if (pareil) identiques += 1;
  console.log(
    `${pareil ? 'OK ' : 'DIFF'} « ${String(c.titre).slice(0, 34)} » ` +
      `stocke=${(c.texte_source ?? '').length} reconstruit=${reconstitue.length} segs=${segs.length}`
  );
}
console.log(`egalite_stricte=${identiques}/${echantillon.length}`);
