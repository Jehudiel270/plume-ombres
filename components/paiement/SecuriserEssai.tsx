'use client';

// ============================================================
// components/paiement/SecuriserEssai.tsx — Sécuriser l'essai avec un
// numéro Mobile Money (facultatif).
//
// L'essai gratuit démarre SANS numéro : ce champ ne sert qu'à
// « réserver » le numéro pour l'anti-abus (1 essai par numéro). Si le
// numéro a déjà servi à un essai non payé, la route répond 409 et
// l'essai du compte est interrompu (bascule en gratuit).
// ============================================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SecuriserEssai({ telephone }: { telephone?: string | null }) {
  const routeur = useRouter();
  const [numero, setNumero] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function soumettre() {
    setErreur(null);
    setMessage(null);
    setEnvoi(true);
    try {
      const r = await fetch('/api/essai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telephone: numero }),
      });
      const d = (await r.json()) as { erreur?: string; code?: string };
      if (!r.ok) throw new Error(d.erreur ?? 'Enregistrement impossible.');
      setMessage('Numéro enregistré pour votre essai.');
      setNumero('');
      routeur.refresh();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur inconnue.');
    } finally {
      setEnvoi(false);
    }
  }

  const invalide = numero.replace(/\D/g, '').length < 8;

  return (
    <div className="mt-4">
      <label
        className="sur-titre text-encre-300 block"
        htmlFor="essai-telephone"
      >
        Sécuriser l’essai avec votre numéro Mobile Money (facultatif)
      </label>
      <p className="text-xs text-encre-500 mt-1 leading-relaxed">
        {telephone
          ? `Numéro déjà enregistré : ${telephone}.`
          : 'Aucun numéro n’est exigé pour l’essai. L’enregistrer évite qu’un autre compte en profite avec le même numéro.'}
      </p>
      <div className="flex flex-wrap gap-2 mt-2">
        <input
          id="essai-telephone"
          className="champ-sombre flex-1 min-w-48"
          placeholder="+229 90 00 00 00"
          inputMode="tel"
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
        />
        <button
          type="button"
          className="bouton-fantome"
          onClick={soumettre}
          disabled={envoi || invalide}
        >
          {envoi ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
      {message && <p className="text-sm text-violet-rom-300 mt-2">{message}</p>}
      {erreur && <p className="text-sm text-grenat-300 mt-2">{erreur}</p>}
    </div>
  );
}
