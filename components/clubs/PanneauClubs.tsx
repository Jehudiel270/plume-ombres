'use client';

// ============================================================
// components/clubs/PanneauClubs.tsx — Liste et création / adhésion
// aux clubs PRIVÉS (F11). Chaque club conduit à son salon.
// ============================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export interface ClubListe {
  id: string;
  titre: string;
  description: string | null;
  codeInvitation: string;
  estCreateur: boolean;
  livreTitre: string | null;
  positionLecture: number;
}

export default function PanneauClubs({ clubs }: { clubs: ClubListe[] }) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState('');
  const [mode, setMode] = useState<'aucun' | 'creer' | 'rejoindre'>('aucun');
  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [code, setCode] = useState('');

  const envoyer = (corps: Record<string, unknown>, apres?: (donnees: { id?: string }) => void) => {
    setErreur('');
    demarrer(async () => {
      try {
        const reponse = await fetch('/api/clubs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(corps),
        });
        const donnees = (await reponse.json()) as { erreur?: string; id?: string };
        if (!reponse.ok) {
          setErreur(donnees.erreur ?? 'Opération refusée.');
          return;
        }
        apres?.(donnees);
        router.refresh();
      } catch {
        setErreur('Réseau indisponible : réessayez.');
      }
    });
  };

  return (
    <div className="space-y-6">
      {erreur && (
        <p
          role="alert"
          className="rounded-lg border border-grenat-700/60 bg-grenat-950/40 px-4 py-2.5 text-sm text-grenat-200"
        >
          {erreur}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode(mode === 'creer' ? 'aucun' : 'creer')}
          className="bouton-principal cursor-pointer"
        >
          Créer un club
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === 'rejoindre' ? 'aucun' : 'rejoindre')}
          className="bouton-fantome cursor-pointer"
        >
          Rejoindre avec un code
        </button>
      </div>

      {mode === 'creer' && (
        <section className="velours p-5 rounded-2xl space-y-3" aria-label="Créer un club">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-encre-400">
              Titre du club
              <input
                type="text"
                value={titre}
                onChange={(e) => setTitre(e.target.value)}
                maxLength={120}
                placeholder="Le cercle du mercredi"
                className="champ-sombre mt-1 w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2 text-sm text-encre-100"
              />
            </label>
            <label className="block text-sm text-encre-400">
              Description (facultative)
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={600}
                placeholder="Sur quel livre, à quel rythme…"
                className="champ-sombre mt-1 w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2 text-sm text-encre-100"
              />
            </label>
          </div>
          <p className="text-xs text-encre-500">
            Le club reste privé : seules les personnes que vous invitez avec le
            code pourront entrer. Vous en deviendrez le créateur ; un club se
            supprime entier depuis sa liste.
          </p>
          <button
            type="button"
            disabled={enCours || !titre.trim()}
            onClick={() =>
              envoyer(
                { action: 'creer', titre, description: description || undefined },
                (donnees) => {
                  setTitre('');
                  setDescription('');
                  setMode('aucun');
                  if (donnees.id) router.push(`/clubs/${donnees.id}`);
                }
              )
            }
            className="bouton-principal cursor-pointer disabled:opacity-50"
          >
            Créer le club
          </button>
        </section>
      )}

      {mode === 'rejoindre' && (
        <section className="velours p-5 rounded-2xl space-y-3" aria-label="Rejoindre un club">
          <label className="block text-sm text-encre-400">
            Code d’invitation (8 caractères)
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={8}
              placeholder="AB23CD56"
              className="champ-sombre mt-1 w-full max-w-56 rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2 text-sm uppercase tracking-widest text-encre-100"
            />
          </label>
          <button
            type="button"
            disabled={enCours || code.length !== 8}
            onClick={() =>
              envoyer({ action: 'rejoindre', code }, (donnees) => {
                setCode('');
                setMode('aucun');
                if (donnees.id) router.push(`/clubs/${donnees.id}`);
              })
            }
            className="bouton-principal cursor-pointer disabled:opacity-50"
          >
            Rejoindre
          </button>
        </section>
      )}

      {clubs.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-nuit-700 p-6 text-center text-sm text-encre-500">
          Vous ne faites partie d’aucun club. Créez le vôtre, ou entrez avec le
          code qu’un ami vous a confié.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {clubs.map((club) => (
            <li key={club.id} className="velours p-5 rounded-2xl flex flex-col">
              <h3 className="font-display text-lg text-encre-100">{club.titre}</h3>
              {club.description && (
                <p className="mt-1 text-xs text-encre-500 line-clamp-2">{club.description}</p>
              )}
              <p className="mt-1 text-xs text-encre-500">
                {club.livreTitre ? `Livre du club : ${club.livreTitre} · ` : ''}
                {club.estCreateur ? 'créé par vous' : 'membre'}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <a href={`/clubs/${club.id}`} className="bouton-principal !min-h-9 !px-3 text-xs">
                  Ouvrir le salon
                </a>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(club.codeInvitation);
                  }}
                  title="Copier le code d'invitation"
                  className="bouton-fantome !min-h-9 !px-3 text-xs cursor-pointer"
                >
                  Code : {club.codeInvitation}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
