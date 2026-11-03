const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENTETES = { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE };
const marque = process.argv[2] ?? 'prod-verif-20261103';

const lecture = await fetch(
  `${URL_BASE}/rest/v1/visites?visiteur=eq.${marque}&select=chemin,source,appareil,cree_le`,
  { headers: ENTETES }
);
const lignes = await lecture.json();
console.log('lignes trouvées :', Array.isArray(lignes) ? lignes.length : lignes);
console.log(JSON.stringify(lignes));

const suppression = await fetch(`${URL_BASE}/rest/v1/visites?visiteur=eq.${marque}`, {
  method: 'DELETE',
  headers: { ...ENTETES, Prefer: 'return=minimal' },
});
console.log('nettoyage :', suppression.status);
