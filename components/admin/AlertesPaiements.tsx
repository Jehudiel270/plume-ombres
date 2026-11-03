'use client';

// ============================================================
// components/admin/AlertesPaiements.tsx — Choisir les alertes reçues.
//
// Deux cases par administrateur : « paiement réussi » et « paiement
// échoué ». Chaque case enregistrée immédiatement ; la notification
// arrive ensuite dans la cloche du tableau de bord ET dans celle du
// site (même table `notifications`).
//
// Le super-administrateur règle aussi les alertes d'un AUTRE
// administrateur, comme pour les sections. La base refuse tout le
// reste (definir_alertes).
// ============================================================

import { useState } from 'react';

interface Reglage {
  reussi: boolean;
  echoue: boolean;
}

interface Props {
  moi: Reglage;
  superAdmin: boolean;
  administrateurs: { id: string; pseudo: string; reussi: boolean; echoue: boolean }[];
}

type Etat = Record<string, Reglage>;

export default function AlertesPaiements({ moi, superAdmin, administrateurs }: Props) {
  const [etat, setEtat] = useState<Etat>(() => {
    const initial: Etat = { moi };
    for (const a of administrateurs) {
      initial[a.id] = { reussi: a.reussi, echoue: a.echoue };
    }
    return initial;
  });
  const [enCours, setEnCours] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, { texte: string; ok: boolean }>>({});

  async function enregistrer(cle: string, valeur: Reglage, utilisateurId: string | null) {
    setEnCours(cle);
    setMessages((m) => ({ ...m, [cle]: { texte: '', ok: true } }));
    try {
      const reponse = await fetch('/api/admin/alertes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          reussi: valeur.reussi,
          echoue: valeur.echoue,
          utilisateurId,
        }),
      });
      const corps = (await reponse.json().catch(() => ({}))) as { erreur?: string };
      if (!reponse.ok) {
        setMessages((m) => ({
          ...m,
          [cle]: { texte: corps.erreur ?? `Échec (${reponse.status}).`, ok: false },
        }));
        return;
      }
      setMessages((m) => ({
        ...m,
        [cle]: { texte: 'Enregistré.', ok: true },
      }));
    } catch {
      setMessages((m) => ({
        ...m,
        [cle]: { texte: 'Réseau indisponible.', ok: false },
      }));
    } finally {
      setEnCours(null);
    }
  }

  function basculer(cle: string, champ: keyof Reglage, utilisateurId: string | null) {
    const courant = etat[cle] ?? { reussi: true, echoue: true };
    const suivant: Reglage = { ...courant, [champ]: !courant[champ] };
    setEtat((e) => ({ ...e, [cle]: suivant }));
    void enregistrer(cle, suivant, utilisateurId);
  }

  const cases: { champ: keyof Reglage; libelle: string; detail: string }[] = [
    {
      champ: 'reussi',
      libelle: 'Paiement réussi',
      detail: 'un client vient de payer (abonnement ou pack de crédits)',
    },
    {
      champ: 'echoue',
      libelle: 'Paiement échoué',
      detail: 'transaction refusée, annulée, ou bloquée en attente',
    },
  ];

  function ligne(cle: string, utilisateurId: string | null, compact: boolean) {
    const courant = etat[cle] ?? { reussi: true, echoue: true };
    const message = messages[cle];
    return (
      <div className={compact ? 'space-y-2' : 'space-y-3'}>
        {cases.map((c) => (
          <label key={c.champ} className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={courant[c.champ]}
              disabled={enCours === cle}
              onChange={() => basculer(cle, c.champ, utilisateurId)}
              className="mt-1 h-4 w-4 accent-grenat-500"
            />
            <span>
              <span className="text-encre-100 text-sm block">{c.libelle}</span>
              <span className="text-encre-500 text-xs block">{c.detail}</span>
            </span>
          </label>
        ))}
        {message?.texte && (
          <p
            className={`text-xs ${message.ok ? 'text-encre-500' : 'text-grenat-300'}`}
            role="status"
          >
            {message.texte}
          </p>
        )}
      </div>
    );
  }

  return (
    <section className="velours p-5 sm:p-6 space-y-6" aria-labelledby="titre-alertes">
      <header className="space-y-2">
        <h2 id="titre-alertes" className="sur-titre text-encre-300">
          Alertes de paiement
        </h2>
        <p className="text-encre-500 text-sm">
          Les alertes arrivent dans la cloche de notifications, y compris la nuit. Cochez ce que
          vous voulez recevoir ; chaque changement est enregistré immédiatement. Par défaut, seul
          le super-administrateur est alerté.
        </p>
      </header>

      <div className="rounded-lg border border-nuit-700/60 p-4">
        <p className="text-encre-300 text-sm mb-3 font-medium">Mes alertes</p>
        {ligne('moi', null, false)}
      </div>

      {superAdmin && administrateurs.length > 0 && (
        <div className="space-y-3">
          <div>
            <p className="text-encre-300 text-sm font-medium">Alertes des autres administrateurs</p>
            <p className="text-encre-500 text-xs">
              Réservé au super-administrateur. Un administrateur peut aussi régler les siennes
              depuis son propre compte.
            </p>
          </div>
          <ul className="divide-y divide-nuit-700/50">
            {administrateurs.map((a) => (
              <li key={a.id} className="py-3 flex flex-col sm:flex-row sm:items-start sm:gap-6">
                <div className="sm:w-1/3">
                  <p className="text-encre-100 text-sm">{a.pseudo}</p>
                  <p className="text-encre-500 text-xs font-mono">{a.id.slice(0, 8)}…</p>
                </div>
                <div className="sm:flex-1 mt-2 sm:mt-0">{ligne(a.id, a.id, true)}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
