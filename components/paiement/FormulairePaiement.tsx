'use client';

// ============================================================
// components/paiement/FormulairePaiement.tsx — Formulaire de paiement
// FedaPay : Mobile Money (5 pays activés sur le compte) ou carte bancaire.
//
// Aucune dépendance à un composant importé : logique propre, classes
// du projet (champ-sombre / bouton-principal / velours) et routes
// /api/paiement et /api/paiement/verifier.
//
// Le numéro n'est demandé QUE pour Mobile Money : un paiement par
// carte Visa / Mastercard se fait sans téléphone.
// ============================================================

import { useState } from 'react';

type Moyen = 'mobile_money' | 'carte';

interface PaysMobileMoney {
  code: string;
  nom: string;
  operateurs: string;
}

/**
 * Pays Mobile Money ACTIVÉS sur le compte FedaPay (dashboard → Paramètres
 * → Moyens de paiement ; constat du 12/11/2026 : 5 pays, 9 moyens).
 *
 * ⚠ Ne PAS ajouter un pays ici sans l'activer d'abord sur le compte :
 * le choix de l'opérateur se fait sur le guichet FedaPay — un client
 * dont le pays n'est pas activé n'y verrait AUCUN moyen de paiement
 * disponible et bloquerait à l'étape suivante.
 */
const PAYS_MOBILE_MONEY: PaysMobileMoney[] = [
  { code: 'bj', nom: 'Bénin', operateurs: 'MTN MoMo, Moov Money, Celtiis…' },
  { code: 'ci', nom: 'Côte d’Ivoire', operateurs: 'Orange Money, MTN MoMo, Moov Money, Wave…' },
  { code: 'sn', nom: 'Sénégal', operateurs: 'Orange Money, Wave…' },
  { code: 'tg', nom: 'Togo', operateurs: 'T-Money (Togocom), Flooz (Moov)' },
  { code: 'ne', nom: 'Niger', operateurs: 'Airtel Money' },
];

const MOYENS: { code: Moyen; nom: string; detail: string }[] = [
  {
    code: 'mobile_money',
    nom: 'Mobile Money',
    detail: 'MTN, Moov, Orange, Wave, Airtel…',
  },
  {
    code: 'carte',
    nom: 'Carte bancaire',
    detail: 'Visa, Mastercard, carte de débit',
  },
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
  const [moyen, setMoyen] = useState<Moyen>('mobile_money');
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
        body: JSON.stringify({
          plan,
          moyen,
          telephone: moyen === 'mobile_money' ? telephone : undefined,
          pays: moyen === 'mobile_money' ? pays : undefined,
        }),
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
  const blocage = moyen === 'mobile_money' && numeroInvalide;

  const libellePrix = planNom
    ? `${planNom}${prixLibelle ? ` (${prixLibelle})` : ''}`
    : '';

  return (
    <div className="space-y-4">
      {/* Choix du moyen */}
      <div>
        <p className="sur-titre text-encre-300 mb-2">Moyen de paiement</p>
        <div className="grid grid-cols-2 gap-2">
          {MOYENS.map((m) => (
            <button
              key={m.code}
              type="button"
              onClick={() => {
                setMoyen(m.code);
                setMessage(null);
              }}
              className={`rounded-xl border px-3 py-3 text-left transition-all duration-200 cursor-pointer ${
                moyen === m.code
                  ? 'border-grenat-500/70 bg-grenat-700/20'
                  : 'border-nuit-700 bg-nuit-900/40 hover:border-grenat-500/40'
              }`}
              aria-pressed={moyen === m.code}
            >
              <span className="block text-sm text-encre-100">{m.nom}</span>
              <span className="block text-[11px] text-encre-500 mt-0.5 leading-snug">
                {m.detail}
              </span>
            </button>
          ))}
        </div>
      </div>

      {libellePrix && (
        <p className="text-xs text-encre-500">
          {libellePrix}
        </p>
      )}

      {moyen === 'mobile_money' ? (
        <>
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
        </>
      ) : (
        <p className="text-xs text-encre-500 leading-relaxed">
          Vous serez redirigé vers la page sécurisée FedaPay pour saisir les
          informations de votre carte (Visa, Mastercard ou carte de débit).
          Aucun numéro de téléphone n’est nécessaire.
        </p>
      )}

      <button
        type="button"
        className="bouton-principal w-full"
        onClick={payer}
        disabled={chargement || blocage}
      >
        {chargement
          ? 'Redirection…'
          : simulation
            ? 'Simuler le paiement'
            : moyen === 'carte'
              ? 'Payer par carte'
              : 'Payer par Mobile Money'}
      </button>

      {message && <p className="text-sm text-grenat-300">{message}</p>}

      {simulation && (
        <p className="text-xs text-encre-500 italic leading-relaxed">
          Mode simulation : aucun numéro ni carte réels ne sont débités, aucune
          clé FedaPay n’est nécessaire. Vous choisirez le succès ou l’échec sur
          l’écran suivant.
        </p>
      )}
    </div>
  );
}
