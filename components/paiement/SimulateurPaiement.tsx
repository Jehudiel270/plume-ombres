'use client';

// ============================================================
// components/paiement/SimulateurPaiement.tsx — Guichet simulé (P0.9).
//
// Rejoue le webhook du fournisseur, en succès ou en échec, sans
// aucune transaction réelle. C'est le « faux opérateur » qui permet
// de tester le tunnel de bout en bout sans clé.
// ============================================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  reference: string;
}

export default function SimulateurPaiement({ reference }: Props) {
  const routeur = useRouter();
  const [chargement, setChargement] = useState<'reussi' | 'echoue' | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function notifier(statut: 'reussi' | 'echoue') {
    setErreur(null);
    setChargement(statut);
    try {
      const r = await fetch('/api/paiement/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference, statut }),
      });
      const d = (await r.json()) as { erreur?: string };
      if (!r.ok) throw new Error(d.erreur ?? 'Traitement impossible.');
      routeur.push(
        `/paiement/${statut === 'reussi' ? 'succes' : 'echec'}?reference=${encodeURIComponent(
          reference
        )}`
      );
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur inconnue.');
      setChargement(null);
    }
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        className="bouton-principal w-full"
        onClick={() => notifier('reussi')}
        disabled={chargement !== null}
      >
        {chargement === 'reussi' ? 'Validation…' : 'Simuler un paiement réussi'}
      </button>
      <button
        type="button"
        className="bouton-fantome w-full"
        onClick={() => notifier('echoue')}
        disabled={chargement !== null}
      >
        {chargement === 'echoue' ? 'Annulation…' : 'Simuler un paiement échoué'}
      </button>
      {erreur && <p className="text-sm text-grenat-300">{erreur}</p>}
    </div>
  );
}
