// ============================================================
// components/admin/BandeauAujourdhui.tsx — Les trois chiffres qui
// comptent, tout en haut du tableau de bord.
//
// Motif retenu : la « hiérarchie » du dashboard. Un tableau de bord qui
// montre vingt indicateurs de la même taille n'en priorise aucun ; trois
// chiffres d'aujourd'hui, comparés à hier, avec leur tendance, suffisent
// à savoir si la journée se passe bien.
//
// Composant SERVEUR (aucun état) : les valeurs et les séries sont
// calculées dans app/admin/page.tsx à partir de données DÉJÀ chargées
// (paiements, visites, crédits) — aucune requête supplémentaire.
//
// Graphiques : SVG à la main, aucune dépendance npm. Les chiffres sont
// en chasse fixe (tabular-nums) pour ne pas danser d'une ligne à l'autre.
// ============================================================

export interface CarteKpi {
  cle: string;
  libelle: string;
  valeur: string;
  unite?: string;
  detail: string;
  /** Variation en % par rapport à la veille (null = pas comparable). */
  delta: number | null;
  /** Série cumulée ou quotidienne, du plus ancien au plus récent. */
  serie: number[];
  /** Nuance de la courbe. */
  ton: 'grenat' | 'violet' | 'or';
}

const COULEURS: Record<CarteKpi['ton'], string> = {
  grenat: 'var(--color-grenat-400)',
  violet: 'var(--color-violet-rom-300)',
  or: 'var(--color-or-ros-300)',
};

/** Trace une courbe lissée dans une boîte 100 × 32. */
function chemin(serie: readonly number[]): string {
  if (serie.length === 0) return '';
  const max = Math.max(...serie, 1);
  const pas = serie.length > 1 ? 100 / (serie.length - 1) : 0;
  return serie
    .map((valeur, index) => {
      const x = index * pas;
      const y = 30 - (valeur / max) * 26;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

function Sparkline({ serie, ton, cle }: { serie: number[]; ton: CarteKpi['ton']; cle: string }) {
  const trace = chemin(serie);
  if (trace === '') return null;
  const aire = `${trace} L100,32 L0,32 Z`;
  const couleur = COULEURS[ton];
  const id = `degrade-${cle}`;
  return (
    <svg
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      className="mt-3 h-8 w-full"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={couleur} stopOpacity="0.35" />
          <stop offset="100%" stopColor={couleur} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={aire} fill={`url(#${id})`} />
      <path
        d={trace}
        fill="none"
        stroke={couleur}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Variation({ delta }: { delta: number | null }) {
  if (delta === null) {
    return <span className="text-encre-500 text-xs">— pas de comparaison</span>;
  }
  const arrondi = Math.round(delta);
  if (arrondi === 0) {
    return <span className="text-encre-500 text-xs">= stable par rapport à hier</span>;
  }
  const hausse = arrondi > 0;
  return (
    <span className={`text-xs chiffres-tabulaires ${hausse ? 'text-grenat-300' : 'text-encre-500'}`}>
      {hausse ? '↑' : '↓'} {Math.abs(arrondi)} % vs hier
    </span>
  );
}

export default function BandeauAujourdhui({ cartes }: { cartes: readonly CarteKpi[] }) {
  if (cartes.length === 0) return null;
  return (
    <section aria-labelledby="titre-aujourdhui" data-reveler="haut">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="titre-aujourdhui" className="sur-titre text-encre-300">
          Aujourd’hui
        </h2>
        <p className="text-encre-500 text-xs">comparé à hier</p>
      </div>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {cartes.map((carte, index) => (
          <article
            key={carte.cle}
            className="velours p-4 sm:p-5 flex flex-col"
            data-reveler="haut"
            data-delai={String(Math.min(index + 1, 6))}
          >
            <p className="text-encre-500 text-[11px] uppercase tracking-wider leading-tight">
              {carte.libelle}
            </p>
            <p className="mt-2 flex items-baseline gap-1.5">
              <span className="font-display text-2xl sm:text-3xl text-encre-100 chiffres-tabulaires break-words">
                {carte.valeur}
              </span>
              {carte.unite ? <span className="text-encre-500 text-xs">{carte.unite}</span> : null}
            </p>
            <Sparkline serie={carte.serie} ton={carte.ton} cle={carte.cle} />
            <div className="mt-auto pt-2 space-y-0.5">
              <Variation delta={carte.delta} />
              <p className="text-encre-500 text-xs">{carte.detail}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
