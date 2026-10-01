// loading.tsx (C7) — état de chargement à la charte.
// Squelette volontairement sobre : il apparaît pendant que le segment
// se rend côté serveur. Les animations passent par les tokens CSS, donc
// neutralisées par prefers-reduced-motion (globals.css).

export default function Chargement() {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="min-h-screen max-w-6xl mx-auto px-4 sm:px-6 py-10"
    >
      <p className="sr-only">Chargement en cours…</p>

      {/* En-tête squelette */}
      <div className="space-y-3">
        <div className="h-9 w-2/3 max-w-sm rounded-lg bg-nuit-800/80 animate-pouls-doux" />
        <div className="liseret" />
        <div className="h-3.5 w-full max-w-md rounded bg-nuit-800/60" />
      </div>

      {/* Grille squelette : mêmes gabarits que .carte-livre */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 mt-8">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="velours p-4 sm:p-5 flex flex-col gap-3 animate-pouls-doux"
            style={{ animationDelay: `${i * 120}ms` }}
          >
            <div className="h-5 w-4/5 rounded bg-nuit-700/70" />
            <div className="h-3 w-2/5 rounded bg-nuit-700/50" />
            <div className="h-3 w-3/5 rounded bg-nuit-700/40" />
            <div className="h-1 rounded-full bg-nuit-700/60 mt-auto" />
          </div>
        ))}
      </div>

      <p className="text-center text-encre-500 text-xs italic mt-10">
        La nuit s’ouvre — les pages arrivent.
      </p>
    </main>
  );
}
