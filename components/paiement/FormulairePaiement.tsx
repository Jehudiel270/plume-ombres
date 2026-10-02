'use client';

// ============================================================
// components/paiement/FormulairePaiement.tsx — Formulaire de paiement
// Mobile Money (P0.9), bâti pour Plume d'Ombres (FedaPay).
//
// Aucune dépendance à un composant importé : logique propre, classes
// du projet (champ-sombre / bouton-principal / velours) et routes
// /api/paiement et /api/paiement/verifier.
//
// En mode simulation, le bouton mène à une page locale qui rejoue le
// webhook : aucun débit, aucune clé.
// ============================================================

import { useState } from 'react';

interface Props {
  /** Plan à souscrire (absent si on vérifie un paiement en cours). */
  plan?: string;
  planNom?: string;
  /** Prix affiché (ex. « 3 000 F CFA / mois »). */
  prixLibelle?: string;
  /** Mode d'affichage : simulation → « Simuler le paiement ». */
  simulation?: boolean;
  /** Référence à vérifier (retour de paiement). */
  reference?: string;
  statutInitial?: string;
}

export default function FormulairePaiement({
  plan,
  planNom,
  prixLibelle,
  simulation = true,
  reference,
  statutInitial,
}: Props) {
  const [telephone, setTelephone] = useState('');
  const [pays, setPays] = useState('bj');
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
      <div className="velours p-5 border border-grenat-500/40">
        <p className="text-sm text-encre-300 mb-3">
          Paiement en cours de vérification{' '}
          <span className="text-encre-500">({reference})</span> — statut :{' '}
          <strong className="text-encre-100">{statut}</strong>
        </p>
        {statut !== 'reussi' && (
          <button
            type="button"
            className="bouton-principal text-sm"
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
        body: JSON.stringify({ plan, telephone, pays }),
      });
      const d = (await r.json()) as { url?: string; erreur?: string };
      if (!r.ok || !d.url) throw new Error(d.erreur ?? 'Paiement impossible.');
      window.location.href = d.url;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Erreur inconnue.');
      setChargement(false);
    }
  }

  const numeroInvalide = telephone.replace(/\D/g, '').length < 8;

  return (
    <div className="space-y-3">
      <div>
        <label className="sur-titre text-encre-300" htmlFor={`tel-${plan}`}>
          Numéro Mobile Money
          {planNom ? ` — ${planNom}` : ''}
          {prixLibelle ? ` (${prixLibelle})` : ''}
        </label>
        <input
          id={`tel-${plan}`}
          className="champ-sombre mt-2 w-full"
          placeholder="+229 90 00 00 00"
          inputMode="tel"
          autoComplete="tel"
          value={telephone}
          onChange={(e) => setTelephone(e.target.value)}
        />
      </div>
      <div>
        <label className="sur-titre text-encre-300" htmlFor={`pays-${plan}`}>
          Pays du numéro
        </label>
        <select
          id={`pays-${plan}`}
          className="champ-sombre mt-2 w-full"
          value={pays}
          onChange={(e) => setPays(e.target.value)}
        >
          <option value="bj">Bénin</option>
          <option value="ci">Côte d’Ivoire</option>
          <option value="sn">Sénégal</option>
          <option value="tg">Togo</option>
          <option value="bf">Burkina Faso</option>
          <option value="ml">Mali</option>
          <option value="ne">Niger</option>
        </select>
      </div>
      <button
        type="button"
        className="bouton-principal w-full"
        onClick={payer}
        disabled={chargement || numeroInvalide}
      >
        {chargement
          ? 'Redirection…'
          : simulation
            ? 'Simuler le paiement Mobile Money'
            : 'Payer par Mobile Money'}
      </button>
      {message && <p className="text-sm text-grenat-300">{message}</p>}
      {simulation && (
        <p className="text-xs text-encre-500 italic leading-relaxed">
          Mode simulation : aucun numéro réel n’est débité, aucune clé FedaPay
          n’est nécessaire. Vous choisirez le succès ou l’échec sur l’écran
          suivant.
        </p>
      )}
    </div>
  );
}
