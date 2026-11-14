'use client';

// ============================================================
// OngletsSalon.tsx — L'ossature du club (F11 v4) : cinq onglets,
// comme le cahier initial : Discussion, Programme de lecture,
// Sondages, Membres, Rencontres.
//
// L'onglet Discussion rend le SALON VIVANT existant (réactions,
// réponses, MP, émojis) sans le toucher ; les quatre autres
// onglets rendent les panneaux qui manquaient.
// ============================================================

import { useState } from 'react';

import SalonClub, { type InfoClub, type MembreSalon } from '@/components/clubs/SalonClub';
import type { MessageSalon } from '@/lib/salon';
import PanneauProgramme, { type EtapeClub } from '@/components/clubs/PanneauProgramme';
import PanneauSondages, { type SondageClub } from '@/components/clubs/PanneauSondages';
import PanneauRencontres, { type RencontreClub } from '@/components/clubs/PanneauRencontres';
import PanneauMembres, {
  type MembreClub,
  type SignalementClub,
} from '@/components/clubs/PanneauMembres';

export type OngletClub = 'discussion' | 'programme' | 'sondages' | 'membres' | 'rencontres';

const ONGLETS: Array<{ valeur: OngletClub; label: string }> = [
  { valeur: 'discussion', label: 'Discussion' },
  { valeur: 'programme', label: 'Programme de lecture' },
  { valeur: 'sondages', label: 'Sondages' },
  { valeur: 'membres', label: 'Membres' },
  { valeur: 'rencontres', label: 'Rencontres' },
];

export default function OngletsSalon({
  ongletInitial = 'discussion',
  salon,
  programme,
  sondages,
  membres,
  rencontres,
}: {
  ongletInitial?: OngletClub;
  salon: {
    clubId: string;
    monId: string;
    club: InfoClub;
    mesLivres: Array<{ id: string; titre: string }>;
    maPosition: number;
    membresSalon: MembreSalon[];
    messages: MessageSalon[];
    masques: number;
    plusAnciens: boolean;
    curseur: number | null;
  };
  programme: {
    etapes: EtapeClub[];
    dernierChapitreDebloque: number | null;
    totalChapitres: number;
    estStaff: boolean;
  };
  sondages: SondageClub[];
  membres: {
    membres: MembreClub[];
    signalements: SignalementClub[];
    monRole: 'admin' | 'moderateur' | 'membre';
    estCreateur: boolean;
  };
  rencontres: { aVenir: RencontreClub[]; passees: RencontreClub[] };
}) {
  const [onglet, setOnglet] = useState<OngletClub>(ongletInitial);

  return (
    <div className="space-y-6">
      {/* Rôles des onglets : vrais boutons, états pressés, sans
          contournement — un club se parcourt au clavier aussi. */}
      <div
        role="tablist"
        aria-label="Espaces du club"
        className="flex gap-1.5 overflow-x-auto pb-1 border-b border-nuit-700/70"
      >
        {ONGLETS.map((o) => (
          <button
            key={o.valeur}
            type="button"
            role="tab"
            aria-selected={onglet === o.valeur}
            onClick={() => setOnglet(o.valeur)}
            className={`whitespace-nowrap !min-h-9 !px-3 text-sm ${
              onglet === o.valeur
                ? 'bouton-principal !rounded-b-none'
                : 'bouton-fantome !rounded-b-none opacity-80 hover:opacity-100'
            } cursor-pointer`}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="animate-fondu-monte">
        {onglet === 'discussion' && (
          <SalonClub
            clubId={salon.clubId}
            monId={salon.monId}
            club={salon.club}
            mesLivres={salon.mesLivres}
            maPosition={salon.maPosition}
            membres={salon.membresSalon}
            messages={salon.messages}
            masques={salon.masques}
            plusAnciens={salon.plusAnciens}
            curseur={salon.curseur}
          />
        )}
        {onglet === 'programme' && (
          <PanneauProgramme
            clubId={salon.clubId}
            etapes={programme.etapes}
            dernierChapitreDebloque={programme.dernierChapitreDebloque}
            maPosition={salon.maPosition}
            totalChapitres={programme.totalChapitres}
            estStaff={programme.estStaff}
          />
        )}
        {onglet === 'sondages' && <PanneauSondages clubId={salon.clubId} sondages={sondages} />}
        {onglet === 'membres' && (
          <PanneauMembres
            clubId={salon.clubId}
            membres={membres.membres}
            signalements={membres.signalements}
            monRole={membres.monRole}
            estCreateur={membres.estCreateur}
          />
        )}
        {onglet === 'rencontres' && (
          <PanneauRencontres
            clubId={salon.clubId}
            aVenir={rencontres.aVenir}
            passees={rencontres.passees}
          />
        )}
      </div>
    </div>
  );
}
