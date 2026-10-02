'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { creerClientNavigateur } from '@/lib/supabase/client';
import { liensNavigationSupplementaires, normaliserRole, type Role } from '@/lib/roles';

interface Props {
  email: string;
  pseudo: string;
  /**
   * Rôle connu du serveur. Optionnel : quand il n'est pas fourni, le
   * composant lit son propre profil (RLS « own ») pour afficher ou non
   * le lien d'administration. Les pages existantes n'ont pas à changer.
   */
  role?: Role | string;
}

export default function BarreNavigation({ email, pseudo, role: roleInitial }: Props) {
  const routeur = useRouter();
  const [role, setRole] = useState<Role>(normaliserRole(roleInitial));

  useEffect(() => {
    if (roleInitial) return;
    let actif = true;
    (async () => {
      try {
        const supabase = creerClientNavigateur();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || !actif) return;
        const { data } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();
        if (actif) setRole(normaliserRole((data as { role?: string } | null)?.role));
      } catch {
        // Silencieux : le lien admin est un CONFORT d'interface ; le
        // garde serveur reste la source de vérité.
      }
    })();
    return () => {
      actif = false;
    };
  }, [roleInitial]);

  async function seDeconnecter() {
    const supabase = creerClientNavigateur();
    await supabase.auth.signOut();
    routeur.push('/connexion');
    routeur.refresh();
  }

  // CUMUL : ces liens s'AJOUTENT à la navigation existante ; on ne
  // remplace jamais les liens historiques d'un rôle.
  const liensSupplementaires = liensNavigationSupplementaires(role);

  return (
    <header className="sticky top-0 z-30 backdrop-blur-xl bg-nuit-950/75 border-b border-nuit-700/60">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
  <Link href="/bibliotheque" className="flex items-center gap-2.5 group">
            {/* Logo au-dessus de la flottaison : chargé tôt (LCP) et sans
                animation si l'utilisateur préfère les mouvements réduits.
                `alt=""` : le nom est déjà porté par le texte adjacent. */}
            <Image
              src="/logo.png"
              alt=""
              width={40}
              height={40}
              loading="eager"
              fetchPriority="high"
              className="h-9 w-9 sm:h-10 sm:w-10 object-contain transition-transform duration-300 motion-safe:group-hover:scale-105"
            />
            <span className="font-display text-xl text-encre-100">
              Plume <span className="texte-douche italic">d’Ombres</span>
            </span>
            <span className="hidden sm:inline text-[10px] uppercase tracking-[0.3em] text-encre-500 group-hover:text-grenat-400 transition-colors">
              studio
            </span>
          </Link>
          {liensSupplementaires.length > 0 && (
            <nav aria-label="Navigation administrateur" className="flex items-center gap-2">
              {liensSupplementaires.map((lien) => (
                <Link
                  key={lien.href}
                  href={lien.href}
                  className="bouton-fantome !px-3 !py-1.5 text-xs whitespace-nowrap"
                >
                  {lien.libelle}
                </Link>
              ))}
            </nav>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:block text-right">
            <p className="text-sm text-encre-100 leading-tight">{pseudo}</p>
            <p className="text-[11px] text-encre-500 leading-tight">{email}</p>
          </div>
          <div
            aria-hidden="true"
            className="w-9 h-9 rounded-full grid place-items-center text-sm font-display italic bg-gradient-to-br from-grenat-600 to-violet-rom-600 text-white shadow"
          >
            {pseudo.slice(0, 1).toUpperCase()}
          </div>
          <button
            type="button"
            onClick={seDeconnecter}
            className="bouton-fantome !px-3 !py-1.5 text-xs min-h-11"
            title="Se déconnecter"
          >
            Quitter
          </button>
        </div>
      </div>
    </header>
  );
}
