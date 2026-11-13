'use client';

// ============================================================
// components/clubs/SalonClub.tsx — Salon d'un club PRIVÉ (F11).
//
// Fil de discussion : publier (avec plafond anti-spoilers
// facultatif), déclarer sa position de lecture, quitter le club.
// Les messages masqués par le serveur ne sont PAS dans les données ;
// un compteur les annonce, sans les trahir.
// ============================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { libellePlafond } from '@/lib/clubs';

export interface InfoClub {
  titre: string;
  description: string | null;
  codeInvitation: string;
  estCreateur: boolean;
  livreTitre: string | null;
}

export interface MessageSalon {
  id: number;
  auteur: string;
  mien: boolean;
  contenu: string;
  plafond: number;
  le: string;
}

export interface MembreSalon {
  pseudo: string;
  moi: boolean;
  position: number;
}

const dateCourte = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
};

export default function SalonClub({
  clubId,
  club,
  maPosition,
  membres,
  messages,
  masques,
}: {
  clubId: string;
  club: InfoClub;
  maPosition: number;
  membres: MembreSalon[];
  messages: MessageSalon[];
  masques: number;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState('');
  const [contenu, setContenu] = useState('');
  const [chapitreMax, setChapitreMax] = useState('');
  const [positionSaisie, setPositionSaisie] = useState(String(maPosition));

  const poster = () => {
    setErreur('');
    demarrer(async () => {
      try {
        const reponse = await fetch(`/api/clubs/${encodeURIComponent(clubId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contenu,
            chapitreMax: chapitreMax ? Number(chapitreMax) : 0,
          }),
        });
        const donnees = (await reponse.json()) as { erreur?: string };
        if (!reponse.ok) {
          setErreur(donnees.erreur ?? 'Publication refusée.');
          return;
        }
        setContenu('');
        setChapitreMax('');
        router.refresh();
      } catch {
        setErreur('Réseau indisponible : réessayez.');
      }
    });
  };

  const majPosition = () => {
    setErreur('');
    demarrer(async () => {
      try {
        const reponse = await fetch(`/api/clubs/${encodeURIComponent(clubId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ positionLecture: Number(positionSaisie) || 0 }),
        });
        if (!reponse.ok) {
          const donnees = (await reponse.json()) as { erreur?: string };
          setErreur(donnees.erreur ?? 'Mise à jour refusée.');
          return;
        }
        router.refresh();
      } catch {
        setErreur('Réseau indisponible : réessayez.');
      }
    });
  };

  const quitter = () => {
    if (!window.confirm('Quitter ce club ?')) return;
    demarrer(async () => {
      try {
        const reponse = await fetch(`/api/clubs/${encodeURIComponent(clubId)}`, {
          method: 'DELETE',
        });
        if (!reponse.ok) {
          const donnees = (await reponse.json()) as { erreur?: string };
          setErreur(donnees.erreur ?? 'Départ refusé.');
          return;
        }
        router.push('/clubs');
      } catch {
        setErreur('Réseau indisponible : réessayez.');
      }
    });
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="sur-titre text-grenat-400">Club privé</p>
        <h1 className="font-display text-3xl text-encre-100 mt-2">{club.titre}</h1>
        {club.description && (
          <p className="text-encre-500 text-sm mt-2">{club.description}</p>
        )}
        <div className="liseret mt-3" />
        <p className="text-xs text-encre-500 mt-2">
          {club.livreTitre ? `Livre du club : ${club.livreTitre} · ` : ''}
          Code d’invitation : <span className="tracking-widest text-encre-300">{club.codeInvitation}</span>
          {club.estCreateur ? ' · vous en êtes le créateur' : ''}
        </p>
      </header>

      {erreur && (
        <p
          role="alert"
          className="rounded-lg border border-grenat-700/60 bg-grenat-950/40 px-4 py-2.5 text-sm text-grenat-200"
        >
          {erreur}
        </p>
      )}

      {/* Ma position de lecture — elle pilote MES masques. */}
      <section className="velours p-5 rounded-2xl" aria-label="Ma position de lecture">
        <h2 className="sur-titre text-encre-300">Ma position de lecture</h2>
        <p className="mt-2 text-xs text-encre-500">
          Les messages liés à un chapitre au-delà de ce numéro restent
          invisibles pour vous (et les vôtres pour les autres). Mettez-la à
          jour au fil de votre lecture.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block text-sm text-encre-400">
            Chapitre atteint (0 = à peine commencé)
            <input
              type="number"
              min={0}
              max={2000}
              value={positionSaisie}
              onChange={(e) => setPositionSaisie(e.target.value)}
              className="champ-sombre mt-1 w-40 rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2 text-sm text-encre-100"
            />
          </label>
          <button
            type="button"
            onClick={majPosition}
            disabled={enCours}
            className="bouton-principal !min-h-10 cursor-pointer disabled:opacity-50"
          >
            Mettre à jour
          </button>
          {!club.estCreateur && (
            <button
              type="button"
              onClick={quitter}
              disabled={enCours}
              className="bouton-fantome !min-h-10 cursor-pointer"
            >
              Quitter le club
            </button>
          )}
        </div>
      </section>

      {/* Membres */}
      <section aria-label="Membres du club">
        <h2 className="sur-titre text-encre-300">Membres ({membres.length})</h2>
        <ul className="mt-2 flex flex-wrap gap-2">
          {membres.map((m) => (
            <li
              key={m.pseudo}
              className="rounded-full border border-nuit-700 px-3 py-1 text-xs text-encre-300"
            >
              {m.pseudo}
              {m.moi ? ' (vous)' : ''} · ch. {m.position}
            </li>
          ))}
        </ul>
      </section>

      {/* Publier */}
      <section className="velours p-5 rounded-2xl space-y-3" aria-label="Écrire au club">
        <h2 className="sur-titre text-encre-300">Écrire au club</h2>
        <label className="block text-sm text-encre-400">
          Votre message
          <textarea
            value={contenu}
            onChange={(e) => setContenu(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Vos impressions, vos hésitations — jamais le texte d’un chapitre."
            className="champ-sombre mt-1 w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2 text-sm text-encre-100"
          />
        </label>
        <label className="block text-sm text-encre-400 max-w-56">
          Plafond anti-spoilers (0 = hors intrigue)
          <input
            type="number"
            min={0}
            max={2000}
            value={chapitreMax}
            onChange={(e) => setChapitreMax(e.target.value)}
            placeholder="0"
            className="champ-sombre mt-1 w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2 text-sm text-encre-100"
          />
        </label>
        <p className="text-xs text-encre-500">
          Un message marqué « jusqu’au chapitre N » sera invisible pour les
          membres qui n’ont pas encore lu ce chapitre — le serveur le retient,
          il ne part même pas vers leur navigateur.
        </p>
        <button
          type="button"
          onClick={poster}
          disabled={enCours || !contenu.trim()}
          className="bouton-principal cursor-pointer disabled:opacity-50"
        >
          Publier
        </button>
      </section>

      {/* Fil */}
      <section aria-label="Messages du club" className="space-y-2">
        <h2 className="sur-titre text-encre-300">Le fil</h2>
        {masques > 0 && (
          <p className="rounded-lg border border-nuit-700 bg-nuit-850/60 px-4 py-2 text-xs text-encre-500">
            {masques} message{masques > 1 ? 's' : ''} au-delà de votre lecture
            {masques > 1 ? ' sont restés invisibles' : ' est resté invisible'}. Mettez
            votre position à jour pour les voir apparaître.
          </p>
        )}
        {messages.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-nuit-700 p-6 text-center text-sm text-encre-500">
            Le fil est vide. Lancez la conversation — avec tact pour ceux qui
            lisent plus lentement.
          </p>
        ) : (
          <ul className="space-y-2">
            {messages.map((m) => (
              <li
                key={m.id}
                className={`rounded-2xl border px-4 py-3 ${
                  m.mien ? 'border-grenat-700/50 bg-grenat-950/20' : 'border-nuit-700 bg-nuit-900/60'
                }`}
              >
                <p className="text-xs text-encre-500">
                  <span className={m.mien ? 'text-grenat-300' : 'text-encre-300'}>
                    {m.auteur}
                    {m.mien ? ' (vous)' : ''}
                  </span>{' '}
                  · {dateCourte(m.le)}
                  {m.plafond > 0 && ` · ${libellePlafond(m.plafond)}`}
                </p>
                <p className="mt-1 text-sm whitespace-pre-line text-encre-200">{m.contenu}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
