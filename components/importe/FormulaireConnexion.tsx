'use client';

// ============================================================
// IMPORTÉ (inventaire 01/10/2026) — code de Carrel, projet afristack.
// Source : C:\Users\dosso\dev\afristack\app\connexion\page.tsx
// (commit c17716c, dépôt github.com/Jehudiel270/afristack).
// Copie VERBATIM (page → composant réutilisable) : la dépendance
// '@/lib/supabase/client' existe déjà dans Plume d'Ombres avec le même
// export 'creerClientNavigateur' — aucun import ne manque.
// AUCUN import depuis une page : namespace isolé.
// Adaptations requises : voir TODO-COMPOSANTS-REUTILISABLES.md §2.
// ============================================================

// ============================================================
// app/connexion/page.tsx — Inscription / connexion Supabase.
// ============================================================
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { creerClientNavigateur } from '@/lib/supabase/client';

export default function Connexion() {
  const routeur = useRouter();
  const [mode, setMode] = useState<'connexion' | 'inscription'>('inscription');
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);

  async function valider(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setChargement(true);
    const supabase = creerClientNavigateur();
    try {
      if (mode === 'inscription') {
        const { error } = await supabase.auth.signUp({
          email,
          password: motDePasse,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password: motDePasse,
        });
        if (error) throw error;
      }
      routeur.push('/tableau-de-bord');
      routeur.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erreur inconnue.');
    } finally {
      setChargement(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-6 py-20">
      <h1 className="text-2xl font-bold mb-2">
        {mode === 'inscription' ? 'Créer un compte' : 'Connexion'}
      </h1>
      <p className="text-sm text-[var(--encre-400)] mb-8">
        {mode === 'inscription'
          ? '10 crédits offerts à l’inscription.'
          : 'Content de te revoir.'}
      </p>

      <form onSubmit={valider} className="carte p-6 space-y-4">
        <div>
          <label className="etiquette" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            className="champ"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="toi@exemple.com"
          />
        </div>
        <div>
          <label className="etiquette" htmlFor="mdp">
            Mot de passe
          </label>
          <input
            id="mdp"
            type="password"
            required
            minLength={6}
            className="champ"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            placeholder="6 caractères minimum"
          />
        </div>
        <button type="submit" className="bouton-or w-full" disabled={chargement}>
          {chargement
            ? 'Patientez…'
            : mode === 'inscription'
              ? 'Créer mon compte'
              : 'Se connecter'}
        </button>
        {message && (
          <p className="text-sm text-[var(--or-vif)]">{message}</p>
        )}
      </form>

      <button
        type="button"
        className="mt-6 text-sm text-[var(--encre-400)] hover:text-[var(--or-vif)]"
        onClick={() =>
          setMode(mode === 'inscription' ? 'connexion' : 'inscription')
        }
      >
        {mode === 'inscription'
          ? 'Déjà un compte ? Se connecter'
          : 'Pas de compte ? S’inscrire'}
      </button>
    </main>
  );
}
