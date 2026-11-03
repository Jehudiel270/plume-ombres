// ============================================================
// app/admin/loading.tsx — Squelette du tableau de bord.
//
// Sans lui, un aller-retour vers /admin laissait un écran vide le temps
// des lectures Supabase (stats, comptes, paiements, journal). Ici on
// montre la FORME de la page — cartes, voyants, onglets — pour que
// l'attente ait une fin visible, sans inventer de chiffres.
// ============================================================

export default function ChargementAdmin() {
  const carte = 'velours h-[104px] animate-pulse';
  const barre = 'rounded bg-nuit-800 animate-pulse';

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <header>
        <div className={`h-3 w-28 ${barre}`} />
        <div className={`mt-3 h-8 w-64 ${barre}`} />
        <div className="liseret mt-3" />
      </header>

      {/* Voyants d'exploitation */}
      <div className="flex flex-wrap gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`h-7 w-36 rounded-full ${barre}`} />
        ))}
      </div>

      {/* Trois chiffres */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className={carte} />
        ))}
      </div>

      {/* Barre d'onglets */}
      <div className="flex flex-wrap gap-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={`h-8 w-24 rounded-full ${barre}`} />
        ))}
      </div>

      <p className="sr-only" role="status">
        Chargement du tableau de bord…
      </p>
    </main>
  );
}
