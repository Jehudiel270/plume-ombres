// Bandeau de gabarit juridique : TOUT texte légal de ce site est une
// rédaction de travail, à faire valider par un juriste avant mise en
// ligne. Le bandeau doit rester visible sur chaque page concernée —
// c'est lui qui empêche de confondre gabarit et contrat.

interface Props {
  /** Précision sur ce qui reste à compléter ou à trancher. */
  children?: React.ReactNode;
}

export default function BandeauGabarit({ children }: Props) {
  return (
    <div
      role="note"
      className="velours !border-l-2 !border-l-amber-400/70 p-4 sm:p-5"
    >
      <p className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
        ⚠ Gabarit à valider
      </p>
      <p className="text-encre-300 text-[13px] leading-relaxed mt-2">
        {children ?? (
          <>
            Ce texte est une <strong>rédaction de travail</strong>, pas un
            document contractuel définitif. Les mentions entre crochets
            doivent être complétées et l’ensemble relu par un juriste avant
            toute mise en ligne ou ouverture du paiement.
          </>
        )}
      </p>
    </div>
  );
}
