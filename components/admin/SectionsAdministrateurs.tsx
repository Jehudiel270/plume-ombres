'use client';

// ============================================================
// components/admin/SectionsAdministrateurs.tsx — Délimiter les parties
// du tableau de bord ouvertes à chaque administrateur.
//
// Réservé au super-administrateur (la route serveur et la base le
// revérifient ; ici on ne fait que cacher/montrer des cases).
//
// Convention : une case décochée partout vaut « aucune section » ;
// le bouton « Tout ouvrir » supprime la ligne en base (comportement
// par défaut : toutes les sections d'exploitation).
// ============================================================

import { useState } from 'react';

import type { CompteAdmin } from '@/lib/admin-stats';
import { estAdmin, normaliserRole } from '@/lib/roles';

const SECTIONS: { cle: string; libelle: string; detail: string }[] = [
  { cle: 'comptes', libelle: 'Comptes', detail: 'liste des comptes, courriels, abonnements par compte' },
  { cle: 'abonnements', libelle: 'Abonnements', detail: 'plans, attributions, anomalies' },
  { cle: 'paiements', libelle: 'Paiements', detail: 'journal des transactions, filtres, export' },
  { cle: 'audience', libelle: 'Audience', detail: 'visites, pages vues, provenance' },
  { cle: 'systeme', libelle: 'Système', detail: 'santé des moteurs, journal, exports' },
];

interface Props {
  comptes: CompteAdmin[];
  /** Sections déjà réglées, par identifiant de compte. Absent = toutes. */
  sectionsInitiales: Record<string, string[] | null>;
}

export default function SectionsAdministrateurs({ comptes, sectionsInitiales }: Props) {
  const administrateurs = comptes.filter((compte) => estAdmin(normaliserRole(compte.role)));

  const [etat, setEtat] = useState<Record<string, string[] | null>>(sectionsInitiales);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, { texte: string; ok: boolean }>>({});

  function basculer(id: string, section: string): void {
    setEtat((courant) => {
      const actuelles = courant[id] === null || courant[id] === undefined
        ? SECTIONS.map((s) => s.cle)
        : courant[id] ?? [];
      const suivantes = actuelles.includes(section)
        ? actuelles.filter((s) => s !== section)
        : [...actuelles, section];
      return { ...courant, [id]: suivantes };
    });
  }

  async function enregistrer(id: string, sections: string[] | null): Promise<void> {
    setEnCours(id);
    setMessages((m) => ({ ...m, [id]: { texte: '', ok: true } }));
    try {
      const reponse = await fetch('/api/admin/sections', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ utilisateurId: id, sections }),
      });
      const corps = (await reponse.json().catch(() => ({}))) as {
        erreur?: string;
        sections?: string[] | null;
      };
      if (!reponse.ok) {
        setMessages((m) => ({
          ...m,
          [id]: { texte: corps.erreur ?? `Échec (${reponse.status}).`, ok: false },
        }));
        return;
      }
      setEtat((courant) => ({ ...courant, [id]: corps.sections ?? null }));
      const ouvertes: string[] = Array.isArray(corps.sections) ? corps.sections : [];
      setMessages((m) => ({
        ...m,
        [id]: {
          texte:
            corps.sections === null
              ? 'Toutes les sections d’exploitation sont ouvertes.'
              : `Sections ouvertes : ${ouvertes.length === 0 ? 'aucune' : ouvertes.join(', ')}.`,
          ok: true,
        },
      }));
    } catch {
      setMessages((m) => ({ ...m, [id]: { texte: 'Réseau indisponible.', ok: false } }));
    } finally {
      setEnCours(null);
    }
  }

  if (administrateurs.length === 0) {
    return (
      <section className="velours p-5 sm:p-6">
        <h3 className="sur-titre text-encre-300">Sections ouvertes aux administrateurs</h3>
        <div className="liseret mt-2" />
        <p className="text-encre-500 text-sm italic mt-3">
          Aucun administrateur nommé pour l’instant.
        </p>
      </section>
    );
  }

  return (
    <section className="velours p-5 sm:p-6" aria-labelledby="titre-sections-admin">
      <h3 id="titre-sections-admin" className="sur-titre text-encre-300">
        Sections ouvertes aux administrateurs
      </h3>
      <div className="liseret mt-2" />
      <p className="text-encre-500 text-sm mt-3 leading-relaxed">
        Cochez les parties du tableau de bord que chaque administrateur peut consulter. Sans
        réglage, un administrateur ne voit rien d’exploitation : ouvrez-lui explicitement les
        sections utiles.
      </p>

      <ul className="mt-4 space-y-4">
        {administrateurs.map((compte) => {
          const ouvertes = etat[compte.id] ?? [];
          const message = messages[compte.id];
          return (
            <li key={compte.id} className="rounded-lg border border-nuit-700/60 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-encre-100 text-sm">
                  {compte.pseudo}
                  <span className="text-encre-500 text-xs ml-2">
                    {LIBELLE_ROLE[normaliserRole(compte.role)]}
                  </span>
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="bouton-fantome text-xs"
                    disabled={enCours === compte.id}
                    onClick={() =>
                      setEtat((courant) => ({
                        ...courant,
                        [compte.id]: SECTIONS.map((s) => s.cle),
                      }))
                    }
                  >
                    Tout cocher
                  </button>
                  <button
                    type="button"
                    className="bouton-fantome text-xs"
                    disabled={enCours === compte.id}
                    onClick={() => void enregistrer(compte.id, [])}
                  >
                    Tout fermer
                  </button>
                </div>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {SECTIONS.map((section) => (
                  <label
                    key={section.cle}
                    className="flex items-start gap-2 text-sm text-encre-300 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={ouvertes.includes(section.cle)}
                      onChange={() => basculer(compte.id, section.cle)}
                    />
                    <span>
                      {section.libelle}
                      <span className="block text-encre-500 text-[11px]">{section.detail}</span>
                    </span>
                  </label>
                ))}
              </div>

              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  className="bouton-fantome text-xs"
                  disabled={enCours === compte.id}
                  onClick={() => void enregistrer(compte.id, ouvertes)}
                >
                  {enCours === compte.id ? 'Enregistrement…' : 'Enregistrer'}
                </button>
                {message && message.texte && (
                  <span
                    className={
                      message.ok ? 'text-encre-500 text-xs' : 'text-grenat-300 text-xs'
                    }
                  >
                    {message.texte}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const LIBELLE_ROLE: Record<string, string> = {
  admin: 'administrateur',
  super_admin: 'super-administrateur',
  utilisateur: 'utilisateur',
};
