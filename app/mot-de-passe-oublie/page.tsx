'use client';

// ============================================================
// app/mot-de-passe-oublie/page.tsx — Demande de réinitialisation.
//
// Sécurité : la réponse est TOUJOURS la même, que l'adresse existe
// ou non — impossible de découvrir qui possède un compte.
// ============================================================

import { useState } from 'react';
import Link from 'next/link';
import { creerClientNavigateur } from '@/lib/supabase/client';

export default function MotDePasseOublie() {
  const [email, setEmail] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      const supabase = creerClientNavigateur();
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/confirmer?suivant=/nouveau-mot-de-passe`,
      });
      if (error) throw error;
      setEnvoye(true);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Une erreur est survenue.';
      setErreur(
        /rate|too many/i.test(message)
          ? 'Trop de demandes : réessaie dans quelques minutes.'
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
            Mot de passe <span className="texte-douche italic">oublié</span>
          </h1>
          <div className="liseret mx-auto mt-5" />
        </div>

        <div className="velours p-7">
          {envoye ? (
            <div className="space-y-4 text-sm">
              <p className="text-encre-100">
                Si un compte existe pour cette adresse, un lien de réinitialisation
                vient d’être envoyé.
              </p>
              <p className="text-encre-500">
                Pense à regarder tes indésirables. Le lien expire au bout d’une heure.
              </p>
              <Link href="/connexion" className="bouton-principal block text-center !py-3">
                Revenir à la connexion
              </Link>
            </div>
          ) : (
            <form onSubmit={soumettre} className="space-y-4">
              <div>
                <label className="text-xs text-encre-500 uppercase tracking-wider block mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  required
                  className="champ-sombre"
                  placeholder="vous@exemple.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              {erreur && (
                <p className="text-sm text-grenat-300 bg-grenat-700/20 border border-grenat-700/50 rounded-xl px-4 py-2.5">
                  {erreur}
                </p>
              )}

              <button type="submit" disabled={envoi} className="bouton-principal w-full !py-3">
                {envoi ? 'Envoi…' : 'Recevoir le lien'}
              </button>

              <p className="text-center text-xs text-encre-500 pt-1">
                <Link href="/connexion" className="hover:text-encre-300">
                  Revenir à la connexion
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
