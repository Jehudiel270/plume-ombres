// ============================================================
// components/admin/BlocRepliable.tsx — Panneau de tableau de bord
// repliable, en HTML natif.
//
// Pourquoi <details> et non un état React : c'est accessible d'office
// (clavier, lecteurs d'écran, Ctrl+F du navigateur trouve le contenu
// même replié n'est pas garanti — d'où le `open` par défaut sur les
// blocs critiques), ça ne nécessite aucun JavaScript, et le bloc garde
// son état quand on revient dessus.
//
// Le résumé affiche toujours un compte utile (« 42 entrées », « 3
// exports ») : replié ne veut pas dire muet.
// ============================================================

import type { ReactNode } from 'react';

interface Props {
  titre: string;
  /** Texte discret à droite du titre : compte, période, état. */
  resume?: ReactNode;
  /** Bloc ouvert au chargement. */
  ouvert?: boolean;
  children: ReactNode;
  /** Ancre stable pour les liens directs. */
  id?: string;
}

export default function BlocRepliable({ titre, resume, ouvert = false, children, id }: Props) {
  return (
    <details
      id={id}
      open={ouvert}
      data-reveler="haut"
      className="group rounded-[12px] border border-nuit-700/70 bg-nuit-800/40"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-[12px] px-4 py-3 transition-colors hover:bg-nuit-800/70 [&::-webkit-details-marker]:hidden">
        <span className="text-sm font-medium text-encre-100">{titre}</span>
        <span className="flex shrink-0 items-center gap-2 text-encre-500">
          {resume ? <span className="text-xs">{resume}</span> : null}
          <span
            aria-hidden="true"
            className="inline-block text-xs transition-transform duration-200 group-open:rotate-180"
          >
            ▾
          </span>
        </span>
      </summary>
      <div className="border-t border-nuit-700/60 px-4 pb-4 pt-3">{children}</div>
    </details>
  );
}
