'use client';

// error.tsx (C7) — frontière d'erreur à la charte.
// Next 16 : la frontière reçoit `error` et `retry` (remplace `reset`).
// Le composant est dans le layout racine : le fond d'ambiance WebGL
// reste affiché derrière.

import Link from 'next/link';
import { useEffect } from 'react';

export default function Erreur({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // Journalisation discrète : aucune donnée du livre, seulement
    // l'erreur technique et son empreinte.
    console.error('[Plume d’Ombres] erreur de rendu :', error);
  }, [error]);

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-16">
      <div
        role="alert"
        className="velours w-full max-w-lg p-8 text-center animate-fondu-monte"
      >
        <p className="text-4xl mb-4 opacity-80" aria-hidden>
          🕯️
        </p>
        <p className="sur-titre text-grenat-400">Erreur inattendue</p>
        <h1 className="font-display text-3xl text-encre-100 mt-3">
          Le fil s’est rompu.
        </h1>
        <div className="liseret mx-auto mt-4" />
        <p className="text-encre-500 text-sm mt-5 leading-relaxed">
          Une obscurité inattendue a interrompu le rendu de cette page. Vos
          livres et vos traductions ne sont pas en cause : rien n’a été
          supprimé. Réessayez — et si l’ombre persiste, revenez à la
          bibliothèque.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 mt-7">
          <button type="button" onClick={() => retry()} className="bouton-principal">
            Réessayer
          </button>
          <Link href="/bibliotheque" className="bouton-fantome">
            Retour à la bibliothèque
          </Link>
        </div>

        {error.digest && (
          <p className="text-encre-500/70 text-[11px] mt-6 font-mono break-all">
            Référence technique : {error.digest}
          </p>
        )}
      </div>
    </main>
  );
}
