'use client';

// ============================================================
// IMPORTÉ (inventaire 01/10/2026) — code de Carrel, projet afristack.
// Source : C:\Users\dosso\dev\afristack\components\PaiementForm.tsx
// (commit c17716c, dépôt github.com/Jehudiel270/afristack, sans licence
//  tierce — aucun code externe).
// Copie VERBATIM, renommée. AUCUN import depuis une page : namespace
// isolé. Adaptations requises avant branchement : voir
// TODO-COMPOSANTS-REUTILISABLES.md §2.
// Dépendances : react uniquement. Route /api/paiement requise côté app.
// ============================================================

// ============================================================
// components/PaiementForm.tsx — Lancement d'un paiement Mobile
// Money depuis le navigateur.
// ============================================================
import { useState } from 'react';

interface Props {
  /** Plan à souscrire (absent si on vérifie un paiement en cours). */
  plan?: string;
  planNom?: string;
  /** Référence à vérifier (retour de paiement). */
  reference?: string;
  statutInitial?: string;
}

export default function PaiementForm({
  plan,
  planNom,
  reference,
  statutInitial,
}: Props) {
  const [telephone, setTelephone] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [statut, setStatut] = useState(statutInitial ?? null);
  const [chargement, setChargement] = useState(false);

  /** Mode « vérification » (retour de la page de paiement). */
  if (reference && !plan) {
    async function verifier() {
      setChargement(true);
      try {
        const r = await fetch('/api/paiement/verifier', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reference }),
        });
        const d = (await r.json()) as { statut?: string; erreur?: string };
        setStatut(d.statut ?? d.erreur ?? 'inconnu');
      } finally {
        setChargement(false);
      }
    }
    return (
      <div className="carte p-5 mb-8 border-[var(--or)]">
        <p className="text-sm mb-3">
          Paiement en cours de vérification{' '}
          <span className="text-[var(--encre-600)]">({reference})</span> —
          statut : <strong>{statut}</strong>
        </p>
        {statut !== 'reussi' && (
          <button
            className="bouton-or text-sm"
            onClick={verifier}
            disabled={chargement}
          >
            {chargement ? 'Vérification…' : 'Vérifier mon paiement'}
          </button>
        )}
      </div>
    );
  }

  async function payer() {
    setMessage(null);
    setChargement(true);
    try {
      const r = await fetch('/api/paiement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, telephone }),
      });
      const d = (await r.json()) as { url?: string; erreur?: string };
      if (!r.ok || !d.url) throw new Error(d.erreur ?? 'Paiement impossible.');
      window.location.href = d.url;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Erreur inconnue.');
      setChargement(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="etiquette" htmlFor={`tel-${plan}`}>
          Numéro Mobile Money {planNom ? `— plan ${planNom}` : ''}
        </label>
        <input
          id={`tel-${plan}`}
          className="champ"
          placeholder="+229 90 00 00 00"
          value={telephone}
          onChange={(e) => setTelephone(e.target.value)}
        />
      </div>
      <button className="bouton-or w-full" onClick={payer} disabled={chargement}>
        {chargement ? 'Redirection…' : 'Payer par Mobile Money'}
      </button>
      {message && <p className="text-sm text-[var(--or-vif)]">{message}</p>}
    </div>
  );
}
