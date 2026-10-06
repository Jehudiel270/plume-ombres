// ============================================================
// components/admin/ExportsAdmin.tsx — Liens d'export CSV du panneau
// (serveur, espace ADMIN).
//
// Chaque lien pointe vers /api/admin/export, dont le GARDE SERVEUR
// re-vérifie la permission : l'interface ne fait que proposer le
// téléchargement. Fichiers UTF-8 (BOM) séparés par « ; », prêts pour
// un tableur français. Aucune ligne n'expose un contenu de livre.
// ============================================================

const EXPORTS = [
  { type: 'comptes', libelle: 'Comptes' },
  { type: 'abonnements', libelle: 'Abonnements' },
  { type: 'anomalies', libelle: 'Anomalies' },
  { type: 'stats', libelle: 'Statistiques' },
  { type: 'paiements', libelle: 'Paiements' },
] as const;

export default function ExportsAdmin() {
  return (
    <section className="velours p-5 sm:p-6" aria-labelledby="titre-exports">
      <h2 id="titre-exports" className="sur-titre text-encre-300">
        Exports
      </h2>
      <div className="liseret mt-3" />
      <p className="text-encre-500 text-xs mt-3">
        Fichiers CSV (UTF-8, séparateur « ; ») prêts pour un tableur. Métadonnées de comptes
        et comptages uniquement — jamais le contenu d’un livre.
      </p>
      <ul className="mt-4 flex flex-wrap gap-2">
        {EXPORTS.map((e) => (
          <li key={e.type}>
            <a
              href={`/api/admin/export?type=${e.type}`}
              className="bouton-fantome"
              download
            >
              {e.libelle}
              <span aria-hidden="true"> ↓</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
