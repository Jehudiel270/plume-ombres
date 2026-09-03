'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { creerClientNavigateur } from '@/lib/supabase/client';

interface Props {
  email: string;
  pseudo: string;
}

export default function BarreNavigation({ email, pseudo }: Props) {
  const routeur = useRouter();

  async function seDeconnecter() {
    const supabase = creerClientNavigateur();
    await supabase.auth.signOut();
    routeur.push('/connexion');
    routeur.refresh();
  }

  return (
    <header className="sticky top-0 z-30 backdrop-blur-xl bg-nuit-950/75 border-b border-nuit-700/60">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link href="/bibliotheque" className="flex items-baseline gap-2 group">
          <span className="font-display text-xl text-encre-100">
            Plume <span className="texte-douche italic">d’Ombres</span>
          </span>
          <span className="hidden sm:inline text-[10px] uppercase tracking-[0.3em] text-encre-500 group-hover:text-grenat-400 transition-colors">
            studio
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <div className="hidden md:block text-right">
            <p className="text-sm text-encre-100 leading-tight">{pseudo}</p>
            <p className="text-[11px] text-encre-500 leading-tight">{email}</p>
          </div>
          <div className="w-9 h-9 rounded-full grid place-items-center text-sm font-display italic bg-gradient-to-br from-grenat-600 to-violet-rom-600 text-white shadow">
            {pseudo.slice(0, 1).toUpperCase()}
          </div>
          <button
            onClick={seDeconnecter}
            className="bouton-fantome !px-3 !py-1.5 text-xs"
            title="Se déconnecter"
          >
            Quitter
          </button>
        </div>
      </div>
    </header>
  );
}
