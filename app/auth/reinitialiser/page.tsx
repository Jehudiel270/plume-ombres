'use client';

// ============================================================
// app/auth/reinitialiser/page.tsx — Repli pour le flux « implicit ».
//
// Supabase peut renvoyer les jetons dans le FRAGMENT d'URL :
//   #access_token=...&refresh_token=...&type=recovery
// Or le fragment n'est JAMAIS transmis au serveur : /auth/confirmer ne
// peut donc rien en faire. Cette page publique, elle, les lit côté
// navigateur, pose la session (setSession) puis renvoie vers
// /nouveau-mot-de-passe. Elle gère aussi l'erreur dans le fragment
// (lien expiré) en renvoyant vers /connexion.
// ============================================================

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { creerClientNavigateur } from '@/lib/supabase/client';

export default function ReinitialiserAuth() {
  const routeur = useRouter();
  const [termine, setTermine] = useState(false);

  useEffect(() => {
    let actif = true;

    // On lit le fragment AVANT toute création de client Supabase, pour
    // ne pas laisser l'auto-détection (`detectSessionInUrl`) consommer
    // l'ancre en premier.
    const brut = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash;
    const params = new URLSearchParams(brut);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const type = params.get('type');
    const erreur = params.get('error') ?? params.get('error_code');

    async function traiter() {
      // Cas d'erreur porté par le fragment (ex. lien expiré).
      if (erreur || (!accessToken && !refreshToken)) {
        const parametre = /expir/i.test(`${erreur ?? ''}`)
          ? 'lien-expire'
          : 'lien-invalide';
        routeur.replace(`/connexion?erreur=${parametre}`);
        return;
      }

      const supabase = creerClientNavigateur();
      // `type` vaut normalement « recovery » ; on accepte tout jeton
      // valide, la page suivante revérifiera la session.
      const { error } = await supabase.auth.setSession({
        access_token: accessToken!,
        refresh_token: refreshToken!,
      });

      if (error || (type && type !== 'recovery')) {
        routeur.replace('/connexion?erreur=lien-expire');
        return;
      }
      routeur.replace('/nouveau-mot-de-passe');
    }

    traiter()
      .catch(() => routeur.replace('/connexion?erreur=lien-expire'))
      .finally(() => {
        if (actif) setTermine(true);
      });

    return () => {
      actif = false;
    };
  }, [routeur]);

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <p className="text-grenat-400 tracking-[0.45em] text-xs uppercase mb-3">
            ✦ votre nuit vous attend ✦
          </p>
          <h1 className="font-display text-4xl text-encre-100">
            Vérification du <span className="texte-douche italic">lien</span>
          </h1>
          <div className="liseret mx-auto mt-5" />
        </div>

        <div className="velours p-7 space-y-4 text-sm text-center">
          {!termine ? (
            <p className="text-encre-100">Ouverture de la réinitialisation…</p>
          ) : (
            <>
              <p className="text-grenat-300">
                Ce lien n’est plus valide (il expire au bout d’une heure).
              </p>
              <Link
                href="/mot-de-passe-oublie"
                className="bouton-principal block text-center !py-3"
              >
                Demander un nouveau lien
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
