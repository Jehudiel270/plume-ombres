'use client';

// ============================================================
// components/paiement/FormulairePaiement.tsx — Formulaire de paiement
// FedaPay : Mobile Money UNIQUEMENT.
//
// Moyens ACTIFS sur le compte FedaPay (relevé de l'exploitant, compte
// business, 12/11/2026) : MTN MoMo Bénin, MTN MoMo Côte d'Ivoire,
// Moov Flooz Bénin, Moov Flooz Togo, Free Money Sénégal, Airtel Money
// Niger, T-Money (Togocel), Celtiis Cash, Wave Côte d'Ivoire.
// La CARTE BANCAIRE n'est PAS activée sur le compte : le choix « Carte »
// a été retiré du formulaire. Ne le réafficher que si FedaPay active
// réellement les cartes (dashboard → Paramètres → Moyens de paiement) —
// sinon le client arriverait sur un guichet sans carte et bloquerait.
//
// Aucune dépendance à un composant importé : logique propre, classes
// du projet (champ-sombre / bouton-principal / velours) et routes
// /api/paiement et /api/paiement/verifier.
// ============================================================

import { useState } from 'react';

interface PaysMobileMoney {
  code: string;
  nom: string;
  operateurs: string;
}

/**
 * Pays Mobile Money ACTIVÉS sur le compte FedaPay, avec SEULEMENT les
 * opérateurs réellement actifs (relevé du 12/11/2026 — 5 pays, 9 moyens).
 *
 * ⚠ Ne PAS ajouter un pays ni un opérateur ici sans le voir dans la
 * liste « Moyens de paiement » du dashboard FedaPay : le choix exact se
 * fait sur le guichet — un client dont le pays n'est pas activé n'y
 * verrait AUCUN moyen disponible et bloquerait à l'étape suivante.
 */
const PAYS_MOBILE_MONEY: PaysMobileMoney[] = [
  { code: 'bj', nom: 'Bénin', operateurs: 'MTN MoMo, Moov Flooz, Celtiis Cash' },
  { code: 'ci', nom: 'Côte d’Ivoire', operateurs: 'MTN MoMo, Wave' },
  { code: 'sn', nom: 'Sénégal', operateurs: 'Free Money' },
  { code: 'tg', nom: 'Togo', operateurs: 'Moov Flooz, T-Money (Togocel)' },
  { code: 'ne', nom: 'Niger', operateurs: 'Airtel Money' },
];

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
  const paysChoisi = PAYS_MOBILE_MONEY.find((p) => p.code === pays);

  const libellePrix = planNom
    ? `${planNom}${prixLibelle ? ` (${prixLibelle})` : ''}`
    : '';

  return (
    <div className="space-y-4">
      <p className="sur-titre text-encre-300">Mobile Money</p>

      {libellePrix && (
        <p className="text-xs text-encre-500">
          {libellePrix}
        </p>
      )}

      <div>
        <label
          className="sur-titre text-encre-300"
          htmlFor={`tel-${plan}`}
        >
          Numéro Mobile Money
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
        <p className="text-[11px] text-encre-500 mt-1">
          Le numéro qui recevra la demande de confirmation.
        </p>
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
          {PAYS_MOBILE_MONEY.map((p) => (
            <option key={p.code} value={p.code}>
              {p.nom}
            </option>
          ))}
        </select>
        {paysChoisi && (
          <p className="text-[11px] text-encre-500 mt-1">
            Opérateurs : {paysChoisi.operateurs} — le choix exact s’affiche
            sur la page sécurisée FedaPay.
          </p>
        )}
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
            ? 'Simuler le paiement'
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
