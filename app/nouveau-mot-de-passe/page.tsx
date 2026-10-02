'use client';

// ============================================================
// app/nouveau-mot-de-passe/page.tsx — Définition d'un nouveau mot
// de passe, après clic sur le lien reçu par e-mail.
//
// L'utilisateur arrive ici avec une SESSION de récupération posée par
// /auth/confirmer : on peut donc appeler updateUser({ password }).
// Sans session, on le renvoie vers la demande de lien.
// ============================================================

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { creerClientNavigateur } from '@/lib/supabase/client';

const LONGUEUR_MIN = 8;

export default function NouveauMotDePasse() {
  const routeur = useRouter();
  const [passe, setPasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [sessionPrete, setSessionPrete] = useState<boolean | null>(null);

  useEffect(() => {
    let actif = true;
    creerClientNavigateur()
      .auth.getUser()
      .then(({ data }) => {
        if (actif) setSessionPrete(Boolean(data.user));
      })
      .catch(() => {
        if (actif) setSessionPrete(false);
      });
    return () => {
      actif = false;
    };
  }, []);

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);

    if (passe.length < LONGUEUR_MIN) {
      setErreur(`Le mot de passe doit contenir au moins ${LONGUEUR_MIN} caractères.`);
      return;
    }
    if (passe !== confirmation) {
      setErreur('Les deux mots de passe ne correspondent pas.');
      return;
    }

    setEnvoi(true);
    try {
      const { error } = await creerClientNavigateur().auth.updateUser({ password: passe });
      if (error) throw error;
      routeur.push('/bibliotheque');
      routeur.refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Une erreur est survenue.';
      setErreur(
        /expired|invalid|session/i.test(message)
          ? 'Ce lien a expiré. Demande un nouveau lien de réinitialisation.'
          : message
      );
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <p className="text-grenat-400 tracking-[0.45em] text-xs uppercase mb-3">
            ✦ votre nuit vous attend ✦
          </p>
          <h1 className="font-display text-4xl text-encre-100">
            Nouveau <span className="texte-douche italic">mot de passe</span>
          </h1>
          <div className="liseret mx-auto mt-5" />
        </div>

        <div className="velours p-7">
          {sessionPrete === false && (
            <div className="space-y-4 text-sm">
              <p className="text-grenat-300">
                Ce lien n’est plus valide (il expire au bout d’une heure).
              </p>
              <Link
                href="/mot-de-passe-oublie"
                className="bouton-principal block text-center !py-3"
              >
                Demander un nouveau lien
              </Link>
            </div>
          )}

          {sessionPrete !== false && (
            <form onSubmit={soumettre} className="space-y-4">
              <div>
                <label className="text-xs text-encre-500 uppercase tracking-wider block mb-1.5">
                  Nouveau mot de passe
                </label>
                <input
                  type="password"
                  required
                  minLength={LONGUEUR_MIN}
                  className="champ-sombre"
                  placeholder="••••••••"
                  value={passe}
                  onChange={(e) => setPasse(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-encre-500 uppercase tracking-wider block mb-1.5">
                  Confirmation
                </label>
                <input
                  type="password"
                  required
                  minLength={LONGUEUR_MIN}
                  className="champ-sombre"
                  placeholder="••••••••"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
              </div>

              {erreur && (
                <p className="text-sm text-grenat-300 bg-grenat-700/20 border border-grenat-700/50 rounded-xl px-4 py-2.5">
                  {erreur}
                </p>
              )}

              <button
                type="submit"
                disabled={envoi || sessionPrete === null}
                className="bouton-principal w-full !py-3"
              >
                {envoi ? 'Enregistrement…' : 'Enregistrer et entrer'}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
