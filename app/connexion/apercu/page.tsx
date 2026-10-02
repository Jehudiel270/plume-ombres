// ============================================================
// Page d'APERÇU D'IDENTITÉ (outil interne, aucun contenu privé).
// Sert de guide de style vivant : palettes, typographies, panneau
// de lecture. Elle vit sous /connexion pour rester accessible
// publiquement — le garde-fou de session de proxy.ts redirige
// toute route inconnue vers /connexion.
// ============================================================
'use client';

import RegleLecture from '@/components/RegleLecture';

const PARAGRAPHE =
  "La nuit tombait sur la ville comme une promesse qu'on n'avait pas " +
  'demandée. Elle referma le livre, et le monde entier retint son souffle. ' +
  'Dans la pénombre, les braises achevaient de mourir.';

export default function ApercuIdentite() {
  return (
    <main className="min-h-screen p-6 sm:p-10">
      <div className="max-w-3xl mx-auto">
        <p className="sur-titre text-grenat-300">Aperçu</p>
        <h1 className="text-affiche mt-2">Plume d’Ombres</h1>
        <p className="text-note text-encre-300 mt-3">
          Guide de style : palettes et typographies du site.
        </p>

        <div className="flex justify-end mt-6">
          <RegleLecture idLecteur="apercu" />
        </div>

        <article
          id="apercu"
          className="lecture colonne-lecture rounded-xl mt-6 p-6"
        >
          <h2 className="text-titre mb-3">Chapitre premier</h2>
          <p className="corps-livre">{PARAGRAPHE}</p>
          <p className="text-note text-grenat-400 mt-4">— accent lisible —</p>
        </article>
      </div>
    </main>
  );
}
