// Bloc de section réutilisable des pages publiques : sur-titre éditorial,
// titre display, liseré grenat et chapô. Garde la charte (nuit/grenat)
// sur toutes les pages sans dupliquer les classes.

interface Props {
  surTitre?: string;
  titre?: string;
  intro?: React.ReactNode;
  id?: string;
  /** Largeur de lecture : `large` pour les grilles, `etroit` pour le texte. */
  gabarit?: 'large' | 'etroit';
  children: React.ReactNode;
}

export default function SectionPublique({
  surTitre,
  titre,
  intro,
  id,
  gabarit = 'large',
  children,
}: Props) {
  return (
    <section
      id={id}
      className={`mx-auto px-4 sm:px-6 py-12 sm:py-16 ${
        gabarit === 'etroit' ? 'max-w-3xl' : 'max-w-5xl'
      }`}
    >
      {surTitre && <p className="sur-titre text-grenat-400">{surTitre}</p>}
      {titre && (
        <h2 className="font-display text-3xl sm:text-4xl text-encre-100 mt-2 text-balance">
          {titre}
        </h2>
      )}
      <div className="liseret mt-4" />
      {intro && (
        <p className="text-encre-500 mt-4 leading-relaxed max-w-2xl">{intro}</p>
      )}
      <div className="mt-8">{children}</div>
    </section>
  );
}
