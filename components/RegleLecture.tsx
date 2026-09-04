// ============================================================
// RegleLecture.tsx — Panneau de confort de lecture du lecteur.
// Glissière (police, taille, interligne, largeur, justification,
// thème). Les préférences sont PERSISTÉES dans localStorage :
// l'utilisateur retrouve son réglage à la prochaine visite.
// ============================================================
'use client';

import { useEffect, useState } from 'react';
import {
  assainirPreferences,
  preferencesEnCss,
  PREFERENCES_PAR_DEFAUT,
  CLEF_PREFERENCES,
  BORNES,
  type PreferencesLecture,
  type ThemeLecture,
  type PoliceLecture,
} from '@/lib/lecture';

const THEMES: Array<{ id: ThemeLecture; libelle: string }> = [
  { id: 'nuit', libelle: 'Nuit' },
  { id: 'encre', libelle: 'Encre' },
  { id: 'parchemin', libelle: 'Parchemin' },
];

const POLICES: Array<{ id: PoliceLecture; libelle: string }> = [
  { id: 'lora', libelle: 'Lora (romain)' },
  { id: 'systeme', libelle: 'Système' },
  { id: 'monospace', libelle: 'Monospace' },
];

function chargerPreferences(): PreferencesLecture {
  if (typeof window === 'undefined') return PREFERENCES_PAR_DEFAUT;
  try {
    const brut = window.localStorage.getItem(CLEF_PREFERENCES);
    return assainirPreferences(brut ? JSON.parse(brut) : undefined);
  } catch {
    return PREFERENCES_PAR_DEFAUT;
  }
}

/**
 * Applique les préférences de lecture sur le CONTENEUR du lecteur
 * (passé en `idLecteur`) sous forme de variables CSS, et expose un
 * bouton Aa + glissières dans un menu déroulant compact.
 */
export default function RegleLecture({ idLecteur }: { idLecteur: string }) {
  const [prefs, setPrefs] = useState<PreferencesLecture>(PREFERENCES_PAR_DEFAUT);
  const [ouvert, setOuvert] = useState(false);
  const [chargé, setChargé] = useState(false);

  // Lecture une seule fois au montage (évite le flash de défaut).
  useEffect(() => {
    setPrefs(chargerPreferences());
    setChargé(true);
  }, []);

  // Persistance + application aux variables CSS.
  useEffect(() => {
    if (!chargé) return;
    try {
      window.localStorage.setItem(CLEF_PREFERENCES, JSON.stringify(prefs));
    } catch {
      /* stockage indisponible (navigation privée) : pas bloquant */
    }
    const cible = document.getElementById(idLecteur);
    if (cible) {
      const css = preferencesEnCss(prefs);
      for (const [cle, valeur] of Object.entries(css)) {
        cible.style.setProperty(cle, valeur);
      }
    }
  }, [prefs, idLecteur, chargé]);

  function maj(patch: Partial<PreferencesLecture>) {
    setPrefs((p) => assainirPreferences({ ...p, ...patch }));
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        className={`bouton-fantome !px-3 !py-1.5 text-xs ${
          ouvert ? '!border-grenat-600 text-grenat-300' : ''
        }`}
        title="Réglages de lecture (police, taille, thème…)"
        aria-expanded={ouvert}
      >
        <span className="font-display text-sm">Aa</span>
      </button>

      {ouvert && (
        <div className="absolute right-0 top-full mt-2 z-40 velours p-4 w-72 text-left animate-fondu-monte">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs uppercase tracking-[0.2em] text-encre-500">
              Confort de lecture
            </p>
            <button
              type="button"
              onClick={() => setOuvert(false)}
              className="text-encre-500 hover:text-encre-100 text-xs cursor-pointer"
              aria-label="Fermer les réglages"
            >
              ✕
            </button>
          </div>

          {/* Taille */}
          <div className="mb-3">
            <div className="flex justify-between text-[11px] text-encre-500 mb-1">
              <span>Taille du texte</span>
              <span>{prefs.taille} px</span>
            </div>
            <input
              type="range"
              min={BORNES.taille.min}
              max={BORNES.taille.max}
              step={1}
              value={prefs.taille}
              onChange={(e) => maj({ taille: Number(e.target.value) })}
              className="regl-lecture w-full"
              aria-label="Taille du texte"
            />
          </div>

          {/* Interligne */}
          <div className="mb-3">
            <div className="flex justify-between text-[11px] text-encre-500 mb-1">
              <span>Interligne</span>
              <span>{prefs.interligne.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={BORNES.interligne.min}
              max={BORNES.interligne.max}
              step={0.05}
              value={prefs.interligne}
              onChange={(e) => maj({ interligne: Number(e.target.value) })}
              className="regl-lecture w-full"
              aria-label="Interligne"
            />
          </div>

          {/* Largeur */}
          <div className="mb-3">
            <div className="flex justify-between text-[11px] text-encre-500 mb-1">
              <span>Largeur de colonne</span>
              <span>{prefs.largeur} caractères</span>
            </div>
            <input
              type="range"
              min={BORNES.largeur.min}
              max={BORNES.largeur.max}
              step={1}
              value={prefs.largeur}
              onChange={(e) => maj({ largeur: Number(e.target.value) })}
              className="regl-lecture w-full"
              aria-label="Largeur de colonne"
            />
          </div>

          {/* Justification */}
          <label className="flex items-center gap-2 mb-3 cursor-pointer">
            <input
              type="checkbox"
              checked={prefs.justifie}
              onChange={(e) => maj({ justifie: e.target.checked })}
              className="accent-grenat-500"
            />
            <span className="text-xs text-encre-300">Justifier le texte</span>
          </label>

          {/* Police */}
          <div className="mb-3">
            <p className="text-[11px] text-encre-500 mb-1.5">Police</p>
            <div className="flex gap-1.5">
              {POLICES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => maj({ police: p.id })}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] border transition-colors cursor-pointer ${
                    prefs.police === p.id
                      ? 'border-grenat-600 bg-nuit-700/60 text-encre-100'
                      : 'border-nuit-700 text-encre-500 hover:text-encre-300'
                  }`}
                >
                  {p.libelle}
                </button>
              ))}
            </div>
          </div>

          {/* Thème */}
          <div className="mb-2">
            <p className="text-[11px] text-encre-500 mb-1.5">Thème du lecteur</p>
            <div className="flex gap-1.5">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => maj({ theme: t.id })}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] border transition-colors cursor-pointer ${
                    prefs.theme === t.id
                      ? 'border-grenat-600 bg-nuit-700/60 text-encre-100'
                      : 'border-nuit-700 text-encre-500 hover:text-encre-300'
                  }`}
                >
                  {t.libelle}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setPrefs(PREFERENCES_PAR_DEFAUT)}
            className="w-full mt-2 text-[11px] text-encre-500 hover:text-grenat-300 transition-colors cursor-pointer"
          >
            Réinitialiser les réglages
          </button>
        </div>
      )}
    </div>
  );
}