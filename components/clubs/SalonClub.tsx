'use client';

// ============================================================
// components/clubs/SalonClub.tsx — Salon d'un club PRIVÉ (F11 v3,
// « salon vivant »).
//
// Le salon complet : fil avec réponses, épinglage, édition sous
// fenêtre de 15 minutes, suppression (auteur ou créateur),
// signalement, RÉACTIONS ÉMOJIS, MESSAGES PRIVÉS entre membres,
// PALETTE D'ÉMOJIS dans la composition, gestion des membres
// (exclusion par le créateur), réglages du club (titre,
// description, livre lié, code d'invitation, suppression du club).
// Chaque action donne un retour visible immédiat (optimiste pour
// les réactions), sans trahir les plafonds anti-spoilers : les
// messages masqués par le serveur ne sont PAS dans les données.
// ============================================================

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  Copy,
  Flag,
  FlagOff,
  Lock,
  Pencil,
  Pin,
  PinOff,
  Reply,
  Settings,
  Smile,
  Trash2,
  UserMinus,
  X,
} from 'lucide-react';

import {
  EMOJIS_REACTIONS,
  libellePlafond,
  MAX_DESCRIPTION,
  MAX_TITRE,
} from '@/lib/clubs';
import type { MessageSalon, ReactionSalon } from '@/lib/salon';
import { triFil } from '@/lib/salon';
import SelecteurEmojis from '@/components/clubs/SelecteurEmojis';

export type { MessageSalon, ReactionSalon } from '@/lib/salon';

export interface InfoClub {
  titre: string;
  description: string | null;
  codeInvitation: string;
  estCreateur: boolean;
  livreId: string | null;
  livreTitre: string | null;
}

export interface MembreSalon {
  utilisateurId: string;
  pseudo: string;
  moi: boolean;
  createur: boolean;
  position: number;
}

type Notification = { ton: 'ok' | 'erreur'; texte: string } | null;

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
  monId,
  club,
  mesLivres,
  maPosition,
  membres,
  messages,
  masques,
  plusAnciens,
  curseur,
}: {
  clubId: string;
  monId: string;
  club: InfoClub;
  mesLivres: Array<{ id: string; titre: string }>;
  maPosition: number;
  membres: MembreSalon[];
  messages: MessageSalon[];
  masques: number;
  plusAnciens: boolean;
  curseur: number | null;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();

  // — Notifications volantes (retour visuel de chaque action) —
  const [notification, setNotification] = useState<Notification>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifier = (texte: string, ton: 'ok' | 'erreur' = 'ok') => {
    setNotification({ ton, texte });
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => setNotification(null), 4000);
  };
  useEffect(
    () => () => {
      if (minuteur.current) clearTimeout(minuteur.current);
    },
    []
  );

  // — Fil : local pour accueillir les pages plus anciennes —
  const [fil, setFil] = useState<MessageSalon[]>(messages);
  const [masquesTotal, setMasquesTotal] = useState(masques);
  const [encoreAnciens, setEncoreAnciens] = useState(plusAnciens);
  const [curseurLocal, setCurseurLocal] = useState<number | null>(curseur);
  const [chargeAnciens, setChargeAnciens] = useState(false);
  useEffect(() => {
    setFil(messages);
    setMasquesTotal(masques);
    setEncoreAnciens(plusAnciens);
    setCurseurLocal(curseur);
  }, [messages, masques, plusAnciens, curseur]);

  // — Composer —
  const [contenu, setContenu] = useState('');
  const [chapitreMax, setChapitreMax] = useState('');
  const [reponse, setReponse] = useState<MessageSalon | null>(null);
  const [prive, setPrive] = useState(false);
  const [destinataire, setDestinataire] = useState('');
  const [pickerOuvert, setPickerOuvert] = useState(false);
  const [pickerMessage, setPickerMessage] = useState<number | null>(null);
  const champMessage = useRef<HTMLTextAreaElement | null>(null);

  // — Position de lecture —
  const [positionSaisie, setPositionSaisie] = useState(String(maPosition));

  // — Édition en place —
  const [edition, setEdition] = useState<{ id: number; texte: string } | null>(null);

  // — Confirmation à deux temps (destructif) —
  const [arme, setArme] = useState<string | null>(null);
  const desarmer = () => setArme(null);

  // — Réglages (créateur) —
  const [reglagesOuverts, setReglagesOuverts] = useState(false);
  const [titreR, setTitreR] = useState(club.titre);
  const [descriptionR, setDescriptionR] = useState(club.description ?? '');
  const [livreR, setLivreR] = useState(club.livreId ?? '');
  const [codeAffiche, setCodeAffiche] = useState(club.codeInvitation);
  const [codeCopie, setCodeCopie] = useState(false);
  useEffect(() => setCodeAffiche(club.codeInvitation), [club.codeInvitation]);

  const appeler = async (
    url: string,
    options: RequestInit
  ): Promise<{ ok: boolean; donnees: Record<string, unknown> }> => {
    try {
      const reponse = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
      });
      const donnees = (await reponse.json().catch(() => ({}))) as Record<string, unknown>;
      return { ok: reponse.ok, donnees };
    } catch {
      return { ok: false, donnees: { erreur: 'Réseau indisponible : réessayez.' } };
    }
  };

  // — Publier (avec réponse, émojis et mode privé facultatifs) —
  const poster = () => {
    desarmer();
    demarrer(async () => {
      if (prive && !destinataire) {
        notifier('Choisissez le destinataire de votre message privé.', 'erreur');
        return;
      }
      const { ok, donnees } = await appeler(`/api/clubs/${encodeURIComponent(clubId)}`, {
        method: 'POST',
        body: JSON.stringify({
          contenu,
          chapitreMax: chapitreMax ? Number(chapitreMax) : 0,
          reponseA: reponse?.id ?? undefined,
          prive: prive || undefined,
          destinataireId: prive ? destinataire : undefined,
        }),
      });
      if (!ok) {
        notifier((donnees.erreur as string) ?? 'Publication refusée.', 'erreur');
        return;
      }
      setContenu('');
      setChapitreMax('');
      setReponse(null);
      setPrive(false);
      setDestinataire('');
      setPickerOuvert(false);
      notifier(prive ? 'Message privé envoyé.' : 'Message publié.');
      router.refresh();
    });
  };

  // — Position de lecture —
  const majPosition = () => {
    demarrer(async () => {
      const { ok, donnees } = await appeler(`/api/clubs/${encodeURIComponent(clubId)}`, {
        method: 'POST',
        body: JSON.stringify({ positionLecture: Number(positionSaisie) || 0 }),
      });
      if (!ok) {
        notifier((donnees.erreur as string) ?? 'Mise à jour refusée.', 'erreur');
        return;
      }
      notifier('Position de lecture mise à jour.');
      router.refresh();
    });
  };

  // — Réagir à un message (bascule OPTIMISTE : le compteur bouge
  //    aussitôt, la base confirme en arrière-plan) —
  const reagir = (m: MessageSalon, emoji: string) => {
    setPickerMessage(null);
    const avant = m.reactions;
    const bascule = (presentes: ReactionSalon[]): ReactionSalon[] => {
      const existante = presentes.find((r) => r.emoji === emoji);
      if (existante?.moi) {
        return presentes
          .map((r) => (r.emoji === emoji ? { ...r, total: r.total - 1, moi: false } : r))
          .filter((r) => r.total > 0);
      }
      if (existante) {
        return presentes.map((r) =>
          r.emoji === emoji ? { ...r, total: r.total + 1, moi: true } : r
        );
      }
      return [...presentes, { emoji, total: 1, moi: true }];
    };
    setFil((precedent) =>
      precedent.map((x) => (x.id === m.id ? { ...x, reactions: bascule(x.reactions) } : x))
    );
    demarrer(async () => {
      const { ok, donnees } = await appeler(
        `/api/clubs/${encodeURIComponent(clubId)}/reactions`,
        {
          method: 'POST',
          body: JSON.stringify({ messageId: m.id, emoji }),
        }
      );
      if (!ok) {
        // Retour à l'état connu du serveur.
        setFil((precedent) =>
          precedent.map((x) => (x.id === m.id ? { ...x, reactions: avant } : x))
        );
        notifier((donnees.erreur as string) ?? 'Réaction refusée.', 'erreur');
      }
    });
  };

  // — Insérer un émoji dans le message, à l'endroit du curseur —
  const insererEmoji = (emoji: string) => {
    const el = champMessage.current;
    if (!el) {
      setContenu((c) => c + emoji);
      return;
    }
    const debut = el.selectionStart ?? contenu.length;
    const fin = el.selectionEnd ?? contenu.length;
    setContenu(contenu.slice(0, debut) + emoji + contenu.slice(fin));
    requestAnimationFrame(() => {
      el.focus();
      const pos = debut + emoji.length;
      el.setSelectionRange(pos, pos);
    });
  };

  // — Quitter / supprimer le club —
  const quitter = () => {
    demarrer(async () => {
      const { ok, donnees } = await appeler(`/api/clubs/${encodeURIComponent(clubId)}`, {
        method: 'DELETE',
      });
      if (!ok) {
        notifier((donnees.erreur as string) ?? 'Départ refusé.', 'erreur');
        setArme(null);
        return;
      }
      router.push('/clubs');
    });
  };

  const supprimerClub = () => {
    demarrer(async () => {
      const { ok, donnees } = await appeler(
        `/api/clubs/${encodeURIComponent(clubId)}?mode=supprimer`,
        { method: 'DELETE' }
      );
      if (!ok) {
        notifier((donnees.erreur as string) ?? 'Suppression refusée.', 'erreur');
        setArme(null);
        return;
      }
      router.push('/clubs');
    });
  };

  // — Réglages du club —
  const enregistrerReglages = () => {
    demarrer(async () => {
      const { ok, donnees } = await appeler(`/api/clubs/${encodeURIComponent(clubId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          titre: titreR,
          description: descriptionR,
          livreId: livreR || null,
        }),
      });
      if (!ok) {
        notifier((donnees.erreur as string) ?? 'Enregistrement refusé.', 'erreur');
        return;
      }
      notifier('Réglages du club enregistrés.');
      router.refresh();
    });
  };

  const regenererCode = () => {
    demarrer(async () => {
      const { ok, donnees } = await appeler(`/api/clubs/${encodeURIComponent(clubId)}`, {
        method: 'POST',
        body: JSON.stringify({ action: 'regenerer-code' }),
      });
      if (!ok) {
        notifier((donnees.erreur as string) ?? 'Régénération refusée.', 'erreur');
        return;
      }
      setCodeAffiche((donnees.codeInvitation as string) ?? codeAffiche);
      notifier('Nouveau code d’invitation généré.');
    });
  };

  // — Actions sur un message —
  const modifierMessage = () => {
    if (!edition) return;
    demarrer(async () => {
      const { ok, donnees } = await appeler(
        `/api/clubs/${encodeURIComponent(clubId)}/messages`,
        {
          method: 'PATCH',
          body: JSON.stringify({ id: edition.id, contenu: edition.texte }),
        }
      );
      if (!ok) {
        notifier((donnees.erreur as string) ?? 'Modification refusée.', 'erreur');
        return;
      }
      setEdition(null);
      notifier('Message modifié.');
      router.refresh();
    });
  };

  const actionMessage = (
    methode: 'POST' | 'DELETE',
    corps: Record<string, unknown>,
    confirmation: string
  ) => {
    demarrer(async () => {
      const url =
        methode === 'DELETE'
          ? `/api/clubs/${encodeURIComponent(clubId)}/messages?id=${corps.id}`
          : `/api/clubs/${encodeURIComponent(clubId)}/messages`;
      const { ok, donnees } = await appeler(url, {
        method: methode,
        body: methode === 'POST' ? JSON.stringify(corps) : undefined,
      });
      if (!ok) {
        notifier((donnees.erreur as string) ?? 'Action refusée.', 'erreur');
        setArme(null);
        return;
      }
      desarmer();
      notifier(confirmation);
      router.refresh();
    });
  };

  const supprimerMessage = (m: MessageSalon) => {
    if (arme !== `msg-${m.id}`) {
      setArme(`msg-${m.id}`);
      return;
    }
    if (reponse?.id === m.id) setReponse(null);
    if (edition?.id === m.id) setEdition(null);
    actionMessage('DELETE', { id: m.id }, 'Message supprimé.');
  };

  // — Exclusion d'un membre (créateur) —
  const exclure = (m: MembreSalon) => {
    if (arme !== `membre-${m.utilisateurId}`) {
      setArme(`membre-${m.utilisateurId}`);
      return;
    }
    demarrer(async () => {
      const { ok, donnees } = await appeler(
        `/api/clubs/${encodeURIComponent(clubId)}/membres?utilisateurId=${encodeURIComponent(
          m.utilisateurId
        )}`,
        { method: 'DELETE' }
      );
      if (!ok) {
        notifier((donnees.erreur as string) ?? 'Retrait refusé.', 'erreur');
        setArme(null);
        return;
      }
      desarmer();
      notifier(`${m.pseudo} n’est plus membre du club.`);
      router.refresh();
    });
  };

  // — Charger les messages plus anciens (pagination) —
  const chargerAnciens = () => {
    if (!curseurLocal) return;
    setChargeAnciens(true);
    demarrer(async () => {
      const { ok, donnees } = await appeler(
        `/api/clubs/${encodeURIComponent(clubId)}?avant=${curseurLocal}`,
        { method: 'GET' }
      );
      setChargeAnciens(false);
      if (!ok) {
        notifier((donnees.erreur as string) ?? 'Chargement refusé.', 'erreur');
        return;
      }
      const anciens = (donnees.messages as MessageSalon[] | undefined) ?? [];
      setFil((precedent) => [...precedent, ...anciens].sort(triFil));
      setMasquesTotal((precedent) => precedent + ((donnees.masques as number) ?? 0));
      setEncoreAnciens((donnees.plusAnciens as boolean) ?? false);
      setCurseurLocal((donnees.curseur as number | null) ?? null);
      notifier('Messages plus anciens chargés.');
    });
  };

  // — Copie du code —
  const copierCode = () => {
    void navigator.clipboard?.writeText(codeAffiche).then(() => {
      setCodeCopie(true);
      setTimeout(() => setCodeCopie(false), 2000);
    });
  };

  const cibleReponse = reponse
    ? fil.find((m) => m.id === reponse.id) ?? null
    : null;
  const epingles = fil.filter((m) => m.epingle);
  const filCourant = fil.filter((m) => !m.epingle);

  // Vue d'un message du fil (épinglé ou non — mêmes actions).
  const rendreMessage = (m: MessageSalon) => {
    const parent = m.reponseA ? fil.find((x) => x.id === m.reponseA) : null;
    const enEdition = edition?.id === m.id;
    const peutSignaler = !m.mien && !club.estCreateur;
    return (
      <li
        key={m.id}
        className={`rounded-2xl border px-4 py-3 ${
          m.epingle
            ? 'border-or-ros-300/40 bg-or-ros-300/5'
            : m.mien
              ? 'border-grenat-700/50 bg-grenat-950/20'
              : 'border-nuit-700 bg-nuit-900/60'
        }`}
      >
        <p className="text-xs text-encre-500 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={m.mien ? 'text-grenat-300' : 'text-encre-300'}>
            {m.auteur}
            {m.mien ? ' (vous)' : ''}
          </span>
          <span>· {dateCourte(m.le)}</span>
          {m.modifieLe && (
            <span className="italic text-encre-500">(modifié)</span>
          )}
          {m.plafond > 0 && (
            <span className="rounded-full border border-nuit-600 px-2 py-0.5">
              {libellePlafond(m.plafond)}
            </span>
          )}
          {m.prive && (
            <span className="inline-flex items-center gap-1 rounded-full border border-nuit-600 bg-nuit-850/80 px-2 py-0.5 text-encre-400">
              <Lock size={11} aria-hidden="true" />
              Privé{m.destinataire ? ` — à ${m.destinataire}` : ''}
            </span>
          )}
          {m.epingle && (
            <span className="inline-flex items-center gap-1 rounded-full border border-or-ros-300/40 px-2 py-0.5 text-or-ros-300">
              <Pin size={11} aria-hidden="true" /> Épinglé
            </span>
          )}
          {m.signale && (
            <span className="inline-flex items-center gap-1 rounded-full border border-grenat-700/60 px-2 py-0.5 text-grenat-300">
              <Flag size={11} aria-hidden="true" /> Signalé
            </span>
          )}
        </p>

        {parent && (
          <p className="mt-1 text-xs text-encre-500 italic flex items-center gap-1">
            <Reply size={11} aria-hidden="true" />
            en réponse à <span className="text-encre-300">{parent.auteur}</span>
          </p>
        )}

        {m.prive && (
          <p className="mt-1 text-xs text-encre-500 italic flex items-center gap-1">
            <Lock size={11} aria-hidden="true" />
            Message privé — visible uniquement de vous
            {m.mien && m.destinataire ? ` et de ${m.destinataire}` : ''}.
          </p>
        )}

        {enEdition ? (
          <div className="mt-2 space-y-2">
            <textarea
              value={edition.texte}
              onChange={(e) => setEdition({ id: m.id, texte: e.target.value })}
              rows={3}
              maxLength={2000}
              className="champ-sombre w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2 text-sm text-encre-100"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={modifierMessage}
                disabled={enCours}
                className="bouton-principal !min-h-8 !px-3 text-xs cursor-pointer disabled:opacity-50"
              >
                {enCours ? 'Enregistrement…' : 'Enregistrer la modification'}
              </button>
              <button
                type="button"
                onClick={() => setEdition(null)}
                className="bouton-fantome !min-h-8 !px-3 text-xs cursor-pointer"
              >
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-1 text-sm whitespace-pre-line text-encre-200">{m.contenu}</p>
        )}

        {/* Réactions posées : un médaillon par émoji, cliquable
            pour se joindre ou se retirer — retour immédiat. */}
        {m.reactions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {m.reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                onClick={() => reagir(m, r.emoji)}
                aria-pressed={r.moi}
                aria-label={
                  r.moi
                    ? `Retirer votre réaction ${r.emoji} (${r.total} en tout)`
                    : `Réagir aussi avec ${r.emoji} (${r.total} en tout)`
                }
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-all cursor-pointer active:scale-95 ${
                  r.moi
                    ? 'border-grenat-500 bg-grenat-950/50 text-grenat-200'
                    : 'border-nuit-700 text-encre-300 hover:border-nuit-500 hover:text-encre-100'
                }`}
              >
                <span aria-hidden="true" className="text-base leading-none">
                  {r.emoji}
                </span>
                {r.total}
              </button>
            ))}
          </div>
        )}

        {/* Actions du message — visibles selon le rôle et l'état. */}
        {!enEdition && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setReponse(m);
                desarmer();
              }}
              title="Répondre à ce message"
              aria-label={`Répondre au message de ${m.auteur}`}
              className="inline-flex items-center gap-1 rounded-full border border-nuit-700 px-2.5 py-1 text-xs text-encre-400 hover:text-encre-100 hover:border-nuit-500 transition-colors cursor-pointer"
            >
              <Reply size={12} aria-hidden="true" /> Répondre
            </button>

            {/* Réagir : ouvre la palette des réactions (liste blanche). */}
            <span className="relative inline-block">
              <button
                type="button"
                onClick={() => {
                  setPickerMessage(pickerMessage === m.id ? null : m.id);
                  desarmer();
                }}
                aria-expanded={pickerMessage === m.id}
                title="Réagir avec un émoji"
                aria-label={`Réagir au message de ${m.auteur} avec un émoji`}
                className="inline-flex items-center gap-1 rounded-full border border-nuit-700 px-2.5 py-1 text-xs text-encre-400 hover:text-encre-100 hover:border-nuit-500 transition-colors cursor-pointer"
              >
                <Smile size={12} aria-hidden="true" /> Réagir
              </button>
              {pickerMessage === m.id && (
                <div className="absolute left-0 top-9">
                  <SelecteurEmojis
                    mode="reaction"
                    titre={`Réagir au message de ${m.auteur}`}
                    onChoisir={(emoji) => reagir(m, emoji)}
                    onFermer={() => setPickerMessage(null)}
                  />
                </div>
              )}
            </span>

            {m.mien && m.editionPossible && (
              <button
                type="button"
                onClick={() => {
                  setEdition({ id: m.id, texte: m.contenu });
                  desarmer();
                }}
                title="Modifier (15 minutes après publication)"
                aria-label={`Modifier votre message`}
                className="inline-flex items-center gap-1 rounded-full border border-nuit-700 px-2.5 py-1 text-xs text-encre-400 hover:text-encre-100 hover:border-nuit-500 transition-colors cursor-pointer"
              >
                <Pencil size={12} aria-hidden="true" /> Modifier
              </button>
            )}

            {(m.mien || club.estCreateur) && (
              <button
                type="button"
                onClick={() => supprimerMessage(m)}
                title={club.estCreateur && !m.mien ? 'Retirer ce message (modération)' : 'Supprimer ce message'}
                aria-label={`Supprimer le message de ${m.auteur}`}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors cursor-pointer border ${
                  arme === `msg-${m.id}`
                    ? 'border-grenat-500 text-grenat-200 bg-grenat-950/60'
                    : 'border-nuit-700 text-encre-400 hover:text-grenat-200 hover:border-grenat-700'
                }`}
              >
                <Trash2 size={12} aria-hidden="true" />
                {arme === `msg-${m.id}` ? 'Confirmer la suppression' : 'Supprimer'}
              </button>
            )}

            {club.estCreateur &&
              (m.epingle ? (
                <button
                  type="button"
                  onClick={() => actionMessage('POST', { action: 'desepingler', id: m.id }, 'Message désépinglé.')}
                  title="Désépingler"
                  aria-label="Désépingler ce message"
                  className="inline-flex items-center gap-1 rounded-full border border-or-ros-300/40 px-2.5 py-1 text-xs text-or-ros-300 hover:text-or-ros-300 transition-colors cursor-pointer"
                >
                  <PinOff size={12} aria-hidden="true" /> Désépingler
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => actionMessage('POST', { action: 'epingler', id: m.id }, 'Message épinglé en tête du fil.')}
                  title="Épingler en tête du fil"
                  aria-label="Épingler ce message"
                  className="inline-flex items-center gap-1 rounded-full border border-nuit-700 px-2.5 py-1 text-xs text-encre-400 hover:text-or-ros-300 hover:border-or-ros-300/60 transition-colors cursor-pointer"
                >
                  <Pin size={12} aria-hidden="true" /> Épingler
                </button>
              ))}

            {club.estCreateur &&
              (m.signale ? (
                <button
                  type="button"
                  onClick={() => actionMessage('POST', { action: 'retirer-signalement', id: m.id }, 'Signalement retiré.')}
                  title="Retirer le signalement"
                  aria-label="Retirer le signalement de ce message"
                  className="inline-flex items-center gap-1 rounded-full border border-nuit-700 px-2.5 py-1 text-xs text-encre-400 hover:text-encre-100 transition-colors cursor-pointer"
                >
                  <FlagOff size={12} aria-hidden="true" /> Retirer le signalement
                </button>
              ) : null)}

            {peutSignaler && (
              <button
                type="button"
                onClick={() => actionMessage('POST', { action: 'signaler', id: m.id }, 'Message signalé au créateur du club.')}
                title="Signaler au créateur du club"
                aria-label={`Signaler le message de ${m.auteur}`}
                className="inline-flex items-center gap-1 rounded-full border border-nuit-700 px-2.5 py-1 text-xs text-encre-400 hover:text-grenat-200 hover:border-grenat-700 transition-colors cursor-pointer"
              >
                <Flag size={12} aria-hidden="true" /> Signaler
              </button>
            )}
          </div>
        )}
      </li>
    );
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
        <p className="text-xs text-encre-500 mt-2 flex flex-wrap items-center gap-x-2">
          {club.livreTitre ? `Livre du club : ${club.livreTitre} · ` : ''}
          Code d’invitation :
          <span className="tracking-widest text-encre-300">{codeAffiche}</span>
          <button
            type="button"
            onClick={copierCode}
            title="Copier le code d'invitation"
            aria-label="Copier le code d'invitation"
            className="inline-flex items-center gap-1 rounded-full border border-nuit-700 px-2 py-0.5 text-xs text-encre-400 hover:text-encre-100 transition-colors cursor-pointer"
          >
            {codeCopie ? (
              <>
                <Check size={11} aria-hidden="true" /> Copié
              </>
            ) : (
              <>
                <Copy size={11} aria-hidden="true" /> Copier
              </>
            )}
          </button>
          {club.estCreateur && (
            <button
              type="button"
              onClick={() => setReglagesOuverts(!reglagesOuverts)}
              aria-expanded={reglagesOuverts}
              aria-controls="reglages-club"
              className="inline-flex items-center gap-1 rounded-full border border-nuit-700 px-2 py-0.5 text-xs text-encre-400 hover:text-encre-100 transition-colors cursor-pointer"
            >
              <Settings size={11} aria-hidden="true" /> Réglages
            </button>
          )}
        </p>
      </header>

      {notification && (
        <p
          role="status"
          className={`rounded-lg border px-4 py-2.5 text-sm animate-fondu-monte ${
            notification.ton === 'ok'
              ? 'border-nuit-600 bg-nuit-850/80 text-encre-200'
              : 'border-grenat-700/60 bg-grenat-950/40 text-grenat-200'
          }`}
        >
          {notification.texte}
        </p>
      )}

      {/* Réglages (créateur seulement) */}
      {club.estCreateur && reglagesOuverts && (
        <section
          id="reglages-club"
          className="velours p-5 rounded-2xl space-y-3"
          aria-label="Réglages du club"
        >
          <h2 className="sur-titre text-encre-300">Réglages du club</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-encre-400">
              Titre
              <input
                type="text"
                value={titreR}
                onChange={(e) => setTitreR(e.target.value)}
                maxLength={MAX_TITRE}
                className="champ-sombre mt-1 w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2 text-sm text-encre-100"
              />
            </label>
            <label className="block text-sm text-encre-400">
              Description
              <input
                type="text"
                value={descriptionR}
                onChange={(e) => setDescriptionR(e.target.value)}
                maxLength={MAX_DESCRIPTION}
                className="champ-sombre mt-1 w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2 text-sm text-encre-100"
              />
            </label>
          </div>
          <label className="block text-sm text-encre-400 max-w-md">
            Livre du club
            <select
              value={livreR}
              onChange={(e) => setLivreR(e.target.value)}
              className="champ-sombre mt-1 w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2 text-sm text-encre-100"
            >
              <option value="">Aucun livre</option>
              {mesLivres.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.titre}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={enregistrerReglages}
              disabled={enCours || !titreR.trim()}
              className="bouton-principal !min-h-10 cursor-pointer disabled:opacity-50"
            >
              {enCours ? 'Enregistrement…' : 'Enregistrer les réglages'}
            </button>
            <button
              type="button"
              onClick={regenererCode}
              disabled={enCours}
              className="bouton-fantome !min-h-10 cursor-pointer disabled:opacity-50"
            >
              Régénérer le code d’invitation
            </button>
            <button
              type="button"
              onClick={() => (arme === 'club' ? supprimerClub() : setArme('club'))}
              disabled={enCours}
              className={`inline-flex items-center gap-1.5 !min-h-10 px-4 rounded-lg text-sm transition-colors cursor-pointer border ${
                arme === 'club'
                  ? 'border-grenat-500 text-grenat-200 bg-grenat-950/60'
                  : 'bouton-fantome'
              }`}
            >
              <Trash2 size={14} aria-hidden="true" />
              {arme === 'club' ? 'Confirmer : tout supprimer' : 'Supprimer le club'}
            </button>
          </div>
          {arme === 'club' && (
            <p className="text-xs text-grenat-300">
              La suppression efface le club, ses messages et ses adhésions, sans
              retour possible. Cliquez une seconde fois pour confirmer.
            </p>
          )}
        </section>
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
              onClick={() => (arme === 'quitter' ? quitter() : setArme('quitter'))}
              disabled={enCours}
              className={`inline-flex items-center !min-h-10 px-4 rounded-lg text-sm transition-colors cursor-pointer border ${
                arme === 'quitter'
                  ? 'border-grenat-500 text-grenat-200 bg-grenat-950/60'
                  : 'bouton-fantome'
              }`}
            >
              {arme === 'quitter' ? 'Confirmer le départ' : 'Quitter le club'}
            </button>
          )}
        </div>
      </section>

      {/* Membres */}
      <section aria-label="Membres du club">
        <h2 className="sur-titre text-encre-300">Membres ({membres.length})</h2>
        <ul className="mt-2 space-y-1.5">
          {membres.map((m) => (
            <li
              key={m.utilisateurId}
              className="flex flex-wrap items-center gap-2 rounded-full border border-nuit-700 px-3 py-1.5 text-xs text-encre-300"
            >
              <span className={m.createur ? 'text-or-ros-300' : ''}>
                {m.pseudo}
                {m.moi ? ' (vous)' : ''}
              </span>
              {m.createur && (
                <span className="rounded-full border border-or-ros-300/40 px-2 py-0.5 text-or-ros-300">
                  Créateur
                </span>
              )}
              <span className="text-encre-500">· ch. {m.position}</span>
              {club.estCreateur && !m.createur && (
                <button
                  type="button"
                  onClick={() => exclure(m)}
                  disabled={enCours}
                  title={`Retirer ${m.pseudo} du club`}
                  aria-label={`Retirer ${m.pseudo} du club`}
                  className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors cursor-pointer border ${
                    arme === `membre-${m.utilisateurId}`
                      ? 'border-grenat-500 text-grenat-200 bg-grenat-950/60'
                      : 'border-nuit-700 text-encre-400 hover:text-grenat-200 hover:border-grenat-700'
                  }`}
                >
                  <UserMinus size={11} aria-hidden="true" />
                  {arme === `membre-${m.utilisateurId}` ? 'Confirmer' : 'Retirer'}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Publier */}
      <section className="velours p-5 rounded-2xl space-y-3" aria-label="Écrire au club">
        <h2 className="sur-titre text-encre-300">Écrire au club</h2>

        {cibleReponse && (
          <p className="flex items-center gap-2 rounded-lg border border-nuit-600 bg-nuit-850/70 px-3 py-2 text-xs text-encre-300">
            <Reply size={12} aria-hidden="true" />
            Réponse à <span className="text-encre-100">{cibleReponse.auteur}</span>
            <button
              type="button"
              onClick={() => setReponse(null)}
              className="ml-auto underline text-encre-500 hover:text-encre-200 cursor-pointer"
            >
              annuler
            </button>
          </p>
        )}

        <label className="block text-sm text-encre-400">
          Votre message
          <textarea
            ref={champMessage}
            value={contenu}
            onChange={(e) => setContenu(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Vos impressions, vos hésitations — jamais le texte d’un chapitre."
            className="champ-sombre mt-1 w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2 text-sm text-encre-100"
          />
        </label>

        {/* Outils du message : émojis, mode privé. */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="relative inline-block">
            <button
              type="button"
              onClick={() => setPickerOuvert(!pickerOuvert)}
              aria-expanded={pickerOuvert}
              title="Insérer un émoji"
              aria-label="Insérer un émoji dans le message"
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors cursor-pointer ${
                pickerOuvert
                  ? 'border-grenat-500 text-grenat-200 bg-grenat-950/40'
                  : 'border-nuit-700 text-encre-400 hover:text-encre-100 hover:border-nuit-500'
              }`}
            >
              <Smile size={13} aria-hidden="true" /> Émojis
            </button>
            {pickerOuvert && (
              <div className="absolute left-0 top-10">
                <SelecteurEmojis
                  mode="composition"
                  titre="Insérer un émoji"
                  onChoisir={insererEmoji}
                  onFermer={() => setPickerOuvert(false)}
                />
              </div>
            )}
          </span>

          <button
            type="button"
            onClick={() => {
              setPrive(!prive);
              setDestinataire('');
              desarmer();
            }}
            aria-pressed={prive}
            title="Visible uniquement du destinataire choisi"
            aria-label="Basculer en message privé"
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors cursor-pointer ${
              prive
                ? 'border-grenat-500 text-grenat-200 bg-grenat-950/40'
                : 'border-nuit-700 text-encre-400 hover:text-encre-100 hover:border-nuit-500'
            }`}
          >
            <Lock size={13} aria-hidden="true" />
            {prive ? 'Message privé activé' : 'Message privé'}
          </button>

          {prive && (
            <label className="inline-flex items-center gap-2 text-xs text-encre-400">
              À
              <select
                value={destinataire}
                onChange={(e) => setDestinataire(e.target.value)}
                aria-label="Destinataire du message privé"
                className="champ-sombre rounded-lg border border-nuit-700 bg-nuit-850 px-2 py-1.5 text-xs text-encre-100"
              >
                <option value="">Choisir un membre…</option>
                {membres
                  .filter((m) => !m.moi)
                  .map((m) => (
                    <option key={m.utilisateurId} value={m.utilisateurId}>
                      {m.pseudo}
                    </option>
                  ))}
              </select>
            </label>
          )}
        </div>
        {prive && (
          <p className="text-xs text-encre-500 italic">
            Un message privé n’est visible que de son destinataire — ni le
            créateur du club, ni les autres membres. Le plafond anti-spoilers
            continue de s’appliquer.
          </p>
        )}

        <div className="flex flex-wrap items-end gap-3">
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
          <button
            type="button"
            onClick={poster}
            disabled={enCours || !contenu.trim() || (prive && !destinataire)}
            className="bouton-principal cursor-pointer disabled:opacity-50"
          >
            {enCours
              ? 'Publication…'
              : prive
                ? 'Envoyer en privé'
                : 'Publier'}
          </button>
        </div>
        <p className="text-xs text-encre-500">
          Un message marqué « jusqu’au chapitre N » sera invisible pour les
          membres qui n’ont pas encore lu ce chapitre — le serveur le retient,
          il ne part même pas vers leur navigateur.
        </p>
      </section>

      {/* Fil */}
      <section aria-label="Messages du club" className="space-y-2">
        <h2 className="sur-titre text-encre-300">Le fil</h2>
        {masquesTotal > 0 && (
          <p className="rounded-lg border border-nuit-700 bg-nuit-850/60 px-4 py-2 text-xs text-encre-500">
            {masquesTotal} message{masquesTotal > 1 ? 's' : ''} au-delà de votre
            lecture{masquesTotal > 1 ? ' sont restés invisibles' : ' est resté invisible'}.
            Mettez votre position à jour pour les voir apparaître.
          </p>
        )}
        {fil.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-nuit-700 p-6 text-center text-sm text-encre-500">
            Le fil est vide. Lancez la conversation — avec tact pour ceux qui
            lisent plus lentement.
          </p>
        ) : (
          <>
            {epingles.length > 0 && (
              <ul className="space-y-2" aria-label="Messages épinglés">
                {epingles.map(rendreMessage)}
              </ul>
            )}
            <ul className="space-y-2">
              {filCourant.map(rendreMessage)}
            </ul>
          </>
        )}
        {encoreAnciens && (
          <button
            type="button"
            onClick={chargerAnciens}
            disabled={enCours || chargeAnciens || !curseurLocal}
            className="bouton-fantome cursor-pointer disabled:opacity-50"
          >
            {chargeAnciens ? 'Chargement…' : 'Charger les messages plus anciens'}
          </button>
        )}
      </section>
    </div>
  );
}
