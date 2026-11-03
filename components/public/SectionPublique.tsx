// Bloc de section réutilisable des pages publiques : sur-titre éditorial,
// titre display, liseré grenat et chapô. Garde la charte (nuit/grenat)
// sur toutes les pages sans dupliquer les classes.

interface Props {
  surTitre?: string;
  titre?: string;
  intro?: React.ReactNode;
  id?: string;
  /**
   * Niveau du titre de section. `1` pour le titre principal de la page
   * (un seul par page, pour l'accessibilité et le référencement),
   * `2` par défaut pour les sections suivantes.
   */
  niveau?: 1 | 2;
  /** Largeur de lecture : `large` pour les grilles, `etroit` pour le texte. */
  gabarit?: 'large' | 'etroit';
  children: React.ReactNode;
}

export default function SectionPublique({
  surTitre,
  titre,
  intro,
  id,
  niveau = 2,
  gabarit = 'large',
  children,
}: Props) {
  const classesTitre =
    'font-display text-3xl sm:text-4xl text-encre-100 mt-2 text-balance';
  return (
    <section
      id={id}
      data-reveler="haut"
      className={`mx-auto px-4 sm:px-6 py-12 sm:py-16 ${
        gabarit === 'etroit' ? 'max-w-3xl' : 'max-w-5xl'
      }`}
    >
      {surTitre && <p className="sur-titre text-grenat-400">{surTitre}</p>}
      {titre &&
        (niveau === 1 ? (
          <h1 className={classesTitre}>{titre}</h1>
        ) : (
          <h2 className={classesTitre}>{titre}</h2>
        ))}
      <div className="liseret mt-4" />
      {intro && (
        <p className="text-encre-500 mt-4 leading-relaxed max-w-2xl">{intro}</p>
      )}
      <div className="mt-8">{children}</div>
    </section>
  );
}
