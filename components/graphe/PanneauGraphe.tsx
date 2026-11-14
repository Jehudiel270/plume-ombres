'use client';

// ============================================================
// PanneauGraphe.tsx — La toile narrative (F25), portage fidèle de
// la maquette components/narrative : « l'arbre de l'histoire ».
//
// · VUE GRAPHE INTERACTIVE : personnages placés par importance
//   (principaux au centre), CHACUN GLISSABLE, déplacement du fond,
//   ZOOM à la molette et aux boutons (50–300 %), survol infobulle,
//   sélection avec mise en avant du voisinage, courbes groupées
//   quand plusieurs relations relient la même paire ;
// · RELATIONS LISIBLES D'UN COUP D'ŒIL : couleur = type (légende
//   cliquable avec compteurs), trait plein/tirets/pointillé =
//   fiabilité (fait/déduction/hypothèse/incertain), épaisseur =
//   intensité, flèches = sens ;
// · VUE PERSONNAGES : lignes triées (importance, puis relations) ;
// · VUE CHRONOLOGIE : événements datés par chapitre, cliquables,
//   localisables sur la toile ;
// · FICHE (panneau latéral) : personnage, relation ou événement ;
// · ÉDITION (propriétaire) : personnages avec importance, relations
//   riches, événements de chronologie ;
// · ANTI-SPOILERS : la portée (« jusqu'au chapitre N ») reste
//   filtrée côté SERVEUR — aucun élément futur ne quitte la base.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  FIABILITES,
  GENRES_EVENEMENT,
  TYPES_RELATION,
  calculerSuggestions,
  libelleRole,
  phraseRelation,
  positionsToile,
  type AreteGraphe,
  type EvenementGraphe,
  type Fiabilite,
  type GenreEvenement,
  type GrapheFiltre,
  type NoeudGraphe,
  type SensRelation,
  type TypeRelation,
} from '@/lib/graphe';
import { CLEF_PROGRESSION, assainirProgression } from '@/lib/progression';

const ROLES = ['protagoniste', 'antagoniste', 'allie', 'secondaire', 'autre'] as const;
const SENS: Array<{ valeur: SensRelation; libelle: string }> = [
  { valeur: 'none', libelle: 'Symétrique (A et B)' },
  { valeur: 'ab', libelle: 'Du premier vers le second' },
  { valeur: 'ba', libelle: 'Du second vers le premier' },
  { valeur: 'both', libelle: 'Réciproque orientée' },
];

const L = 1000; // largeur du canevas (viewBox)
const H = 700; // hauteur du canevas

export interface ChapitreGraphe {
  id: string;
  titre: string;
  position: number;
}

interface Props {
  livreId: string;
  chapitres: ChapitreGraphe[];
  estProprietaire: boolean;
}

type Selection = { k: 'personnage' | 'relation' | 'evenement'; id: string } | null;

interface Position {
  x: number;
  y: number;
}

interface AreteVue {
  arete: AreteGraphe;
  d: string;
  couleur: string;
  largeur: number;
  tirets: string;
  flecheFin: boolean;
  flecheDebut: boolean;
  mx: number;
  my: number;
  opacite: number;
  selectionnee: boolean;
  labelVisible: boolean;
}

// ============================================================
// Composant principal
// ============================================================
export default function PanneauGraphe({ livreId, chapitres, estProprietaire }: Props) {
  const positionMax = chapitres.length;

  // ---------- Données ----------
  const [chapitreLu, setChapitreLu] = useState<number>(positionMax);
  const [graphe, setGraphe] = useState<GrapheFiltre | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  // ---------- Vue ----------
  const [vue, setVue] = useState<'graphe' | 'personnages' | 'chronologie'>('graphe');
  const [selection, setSelection] = useState<Selection>(null);
  const [retour, setRetour] = useState<Selection>(null); // personnage d'où l'on vient
  const [feuille, setFeuille] = useState(false);
  const [portraits, setPortraits] = useState(true);
  const [toujoursLabels, setToujoursLabels] = useState(false);
  const [filtresOuverts, setFiltresOuverts] = useState(false);
  const [typesInactifs, setTypesInactifs] = useState<Record<string, boolean>>({});
  const [principauxSeuls, setPrincipauxSeuls] = useState(false);
  const [fiabiliteFiltre, setFiabiliteFiltre] = useState<'all' | 'sure' | 'unsure'>('all');
  const [recherche, setRecherche] = useState('');
  const [resultatsOuverts, setResultatsOuverts] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  // Aide (mode d'emploi) et SUGGESTIONS LOCALES (calculées, sans IA).
  const [aideOuverte, setAideOuverte] = useState(false);
  const [suggestionsOuvertes, setSuggestionsOuvertes] = useState(false);
  const [suggestionRelation, setSuggestionRelation] = useState<{
    origineId: string;
    destinationId: string;
  } | null>(null);

  // ---------- Toile : caméra et dispositions ----------
  const [deplacements, setDeplacements] = useState<Record<string, Position>>({});
  const [zoom, setZoom] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [survol, setSurvol] = useState<
    { k: 'n' | 'e'; id: string; x: number; y: number } | null
  >(null);

  type ResultatGraphe = { donnees: GrapheFiltre | null; erreur: string | null };

  /** Lecture PURE de l'API : aucune écriture d'état (motif OrdreChaine). */
  const lireGraphe = useCallback(async (): Promise<ResultatGraphe> => {
    try {
      const reponse = await fetch(
        `/api/livres/${livreId}/graphe?chapitreLu=${chapitreLu}`
      );
      const donnees = (await reponse.json().catch(() => ({}))) as {
        erreur?: string;
      } & GrapheFiltre;
      if (!reponse.ok) {
        return { donnees: null, erreur: donnees.erreur ?? 'Graphe indisponible.' };
      }
      return {
        donnees: {
          noeuds: donnees.noeuds,
          aretes: donnees.aretes,
          evenements: donnees.evenements ?? [],
          masquees: donnees.masquees,
        },
        erreur: null,
      };
    } catch {
      return { donnees: null, erreur: 'Réseau indisponible.' };
    }
  }, [livreId, chapitreLu]);

  const appliquer = useCallback((resultat: ResultatGraphe) => {
    setChargement(false);
    if (resultat.erreur) {
      setErreur(resultat.erreur);
      setGraphe(null);
      return;
    }
    setErreur(null);
    setGraphe(resultat.donnees);
  }, []);

  useEffect(() => {
    let vivant = true;
    void lireGraphe().then((resultat) => {
      if (vivant) appliquer(resultat);
    });
    return () => {
      vivant = false;
    };
  }, [lireGraphe, appliquer]);

  const recharger = useCallback(async () => {
    appliquer(await lireGraphe());
  }, [lireGraphe, appliquer]);

  // ---------- Filtres côté client (types, fiabilité, rôle) ----------
  const aretesFiltrees = useMemo(() => {
    if (!graphe) return [];
    return graphe.aretes.filter((a) => {
      if (typesInactifs[a.type]) return false;
      if (fiabiliteFiltre === 'sure') return a.fiabilite === 'fait' || a.fiabilite === 'deduction';
      if (fiabiliteFiltre === 'unsure')
        return a.fiabilite === 'hypothese' || a.fiabilite === 'incertain';
      return true;
    });
  }, [graphe, typesInactifs, fiabiliteFiltre]);

  const noeudsFiltres = useMemo(() => {
    if (!graphe) return [];
    if (!principauxSeuls) return graphe.noeuds;
    return graphe.noeuds.filter((n) => n.importance === 3);
  }, [graphe, principauxSeuls]);

  const evenementsFiltres = useMemo(() => {
    if (!graphe) return [];
    return graphe.evenements.filter((e) => {
      const personnagesConnus = e.personnageIds.filter((id) =>
        noeudsFiltres.some((n) => n.id === id)
      );
      if (principauxSeuls && personnagesConnus.length === 0 && e.personnageIds.length > 0) {
        return false;
      }
      const rel = graphe.aretes.find((a) => a.id === e.relationId);
      if (rel && typesInactifs[rel.type]) return false;
      return true;
    });
  }, [graphe, noeudsFiltres, typesInactifs, principauxSeuls]);

  // ---------- Résultats de recherche ----------
  const correspondances = useMemo(() => {
    const t = recherche.trim().toLowerCase();
    if (!t || !graphe) return [];
    return graphe.noeuds.filter((n) =>
      `${n.nom} ${libelleRole(n.role)} ${n.description ?? ''}`.toLowerCase().includes(t)
    );
  }, [recherche, graphe]);

  const nomParId = useMemo(
    () => new Map((graphe?.noeuds ?? []).map((n) => [n.id, n.nom])),
    [graphe]
  );
  const nomDe = useCallback((id: string) => nomParId.get(id) ?? '?', [nomParId]);

  // ---------- Construction de la toile (positions, courbes, mise en avant) ----------
  const positions = useMemo(() => {
    const base = positionsToile(
      (graphe?.noeuds ?? []).map((n) => ({ id: n.id, importance: n.importance }))
    );
    return { ...base, ...deplacements };
  }, [graphe, deplacements]);

  const degreParId = useMemo(() => {
    const d: Record<string, number> = {};
    aretesFiltrees.forEach((a) => {
      d[a.origineId] = (d[a.origineId] ?? 0) + 1;
      d[a.destinationId] = (d[a.destinationId] ?? 0) + 1;
    });
    return d;
  }, [aretesFiltrees]);

  // SUGGESTIONS LOCALES : calculées depuis le graphe visible (sans IA).
  const suggestions = useMemo(
    () => (graphe ? calculerSuggestions(graphe) : null),
    [graphe]
  );
  const compteurSuggestions = suggestions
    ? suggestions.pairesSansLien.length + suggestions.isoles.length
    : 0;

  // Mise en avant : voisinage direct du personnage sélectionné,
  // extrémités de la relation, personnages de l'événement, résultats.
  const misEnAvant = useMemo(() => {
    if (!selection) return null;
    const hl = new Set<string>();
    if (selection.k === 'personnage' && nomParId.has(selection.id)) {
      hl.add(selection.id);
      aretesFiltrees.forEach((a) => {
        if (a.origineId === selection.id) hl.add(a.destinationId);
        if (a.destinationId === selection.id) hl.add(a.origineId);
      });
    } else if (selection.k === 'relation') {
      const a = aretesFiltrees.find((x) => x.id === selection.id);
      if (a) {
        hl.add(a.origineId);
        hl.add(a.destinationId);
      }
    } else if (selection.k === 'evenement') {
      const e = evenementsFiltres.find((x) => x.id === selection.id);
      e?.personnageIds.forEach((id) => hl.add(id));
    }
    return hl;
  }, [selection, aretesFiltrees, evenementsFiltres, nomParId]);

  const rayonDe = useCallback(
    (n: NoeudGraphe) => (portraits ? [22, 28, 36] : [14, 18, 24])[n.importance - 1],
    [portraits]
  );

  const aretesVues = useMemo<AreteVue[]>(() => {
    const ids = new Set(noeudsFiltres.map((n) => n.id));
    const rayonParId: Record<string, number> = {};
    noeudsFiltres.forEach((n) => {
      rayonParId[n.id] = rayonDe(n);
    });
    // Groupement des paires pour écarter les courbes superposées.
    const groupes: Record<string, AreteGraphe[]> = {};
    aretesFiltrees.forEach((a) => {
      const cle = [a.origineId, a.destinationId].sort().join('|');
      (groupes[cle] ??= []).push(a);
    });
    const rechercheActive = correspondances.length > 0 && recherche.trim().length > 0;
    return aretesFiltrees
      .filter((a) => ids.has(a.origineId) && ids.has(a.destinationId))
      .map((a) => {
        const cle = [a.origineId, a.destinationId].sort().join('|');
        const groupe = groupes[cle];
        const idx = groupe.indexOf(a);
        const premier = [a.origineId, a.destinationId].sort()[0];
        const A = positions[a.origineId];
        const B = positions[a.destinationId];
        if (!A || !B) return null;
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const dd = Math.hypot(dx, dy) || 1;
        // Décalage latéral perpendiculaire pour les paires multiples.
        const ecart = (idx - (groupe.length - 1) / 2) * 70 + (groupe.length === 1 ? 16 : 0);
        const cx = (A.x + B.x) / 2 - (dy / dd) * ecart;
        const cy = (A.y + B.y) / 2 + (dx / dd) * ecart;
        const rA = rayonParId[a.origineId] ?? 18;
        const rB = rayonParId[a.destinationId] ?? 18;
        const u1 = Math.hypot(cx - A.x, cy - A.y) || 1;
        const u2 = Math.hypot(cx - B.x, cy - B.y) || 1;
        const sx = A.x + ((cx - A.x) / u1) * (rA + 3);
        const sy = A.y + ((cy - A.y) / u1) * (rA + 3);
        const ex = B.x + ((cx - B.x) / u2) * (rB + 4);
        const ey = B.y + ((cy - B.y) / u2) * (rB + 4);
        const mx = 0.25 * sx + 0.5 * cx + 0.25 * ex;
        const my = 0.25 * sy + 0.5 * cy + 0.25 * ey;
        const def = TYPES_RELATION[a.type];
        const oriente = def.oriente;
        const versB = a.sens === 'ab' || (a.sens === 'both' && oriente);
        const versA = a.sens === 'ba' || (a.sens === 'both' && oriente);
        // La flèche « fin » pointe vers la destination du tracé (A → B
        // quand a.origineId est le premier point trié, sinon l'inverse).
        const traceAB = premier === a.origineId;
        const flecheFin = traceAB ? versB : versA;
        const flecheDebut = traceAB ? versA : versB;
        let opacite = 1;
        if (rechercheActive) {
          opacite = correspondances.some(
            (c) => c.id === a.origineId || c.id === a.destinationId
          )
            ? 1
            : 0.12;
        } else if (misEnAvant) {
          const lie =
            selection?.k === 'relation'
              ? a.id === selection.id
              : misEnAvant.has(a.origineId) && misEnAvant.has(a.destinationId);
          opacite = lie ? 1 : 0.12;
        }
        const selectionnee = selection?.k === 'relation' && selection.id === a.id;
        return {
          arete: a,
          d: `M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`,
          couleur: def.couleur,
          largeur: 1.2 + a.intensite * 0.7,
          tirets: FIABILITES[a.fiabilite].tirets,
          flecheFin,
          flecheDebut,
          mx,
          my,
          opacite,
          selectionnee,
          labelVisible:
            selectionnee || (survol?.k === 'e' && survol.id === a.id) || toujoursLabels,
        } satisfies AreteVue;
      })
      .filter((a): a is AreteVue => a !== null);
  }, [
    aretesFiltrees,
    noeudsFiltres,
    positions,
    rayonDe,
    misEnAvant,
    selection,
    survol,
    toujoursLabels,
    correspondances,
    recherche,
  ]);

  const legende = useMemo(() => {
    const comptes: Record<string, number> = {};
    (graphe?.aretes ?? []).forEach((a) => {
      comptes[a.type] = (comptes[a.type] ?? 0) + 1;
    });
    return (Object.keys(comptes) as TypeRelation[])
      .sort((x, y) => comptes[y] - comptes[x])
      .map((t) => ({ id: t, libelle: TYPES_RELATION[t].libelle, couleur: TYPES_RELATION[t].couleur, compte: comptes[t] }));
  }, [graphe]);

  // ---------- Interactions pointeur (adaptées de la maquette) ----------
  const toileRef = useRef<SVGSVGElement | null>(null);
  type Drag =
    | { k: 'pan'; sx: number; sy: number; tx0: number; ty0: number; echelle: number; bouge: boolean }
    | {
        k: 'nœud';
        id: string;
        sx: number;
        sy: number;
        x0: number;
        y0: number;
        echelle: number;
        bouge: boolean;
      };
  const drag = useRef<Drag | null>(null);

  const geometrie = useCallback(() => {
    const sv = toileRef.current;
    if (!sv) return { echelle: 1, ox: 0, oy: 0, rect: new DOMRect(0, 0, 1, 1) };
    const rect = sv.getBoundingClientRect();
    const echelle = Math.min(rect.width / L, rect.height / H) || 1;
    return {
      echelle,
      ox: (rect.width - L * echelle) / 2,
      oy: (rect.height - H * echelle) / 2,
      rect,
    };
  }, []);

  const fondPresser = useCallback(
    (e: React.PointerEvent) => {
      const g = geometrie();
      drag.current = {
        k: 'pan',
        sx: e.clientX,
        sy: e.clientY,
        tx0: tx,
        ty0: ty,
        echelle: g.echelle,
        bouge: false,
      };
      try {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
    },
    [tx, ty, geometrie]
  );

  const noeudPresser = useCallback(
    (e: React.PointerEvent, n: NoeudGraphe) => {
      const g = geometrie();
      const p = positions[n.id] ?? { x: L / 2, y: H / 2 };
      drag.current = {
        k: 'nœud',
        id: n.id,
        sx: e.clientX,
        sy: e.clientY,
        x0: p.x,
        y0: p.y,
        echelle: g.echelle,
        bouge: false,
      };
      try {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
    },
    [positions, geometrie]
  );

  const deplacer = useCallback(
    (e: React.PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.sx;
      const dy = e.clientY - d.sy;
      if (!d.bouge && Math.abs(dx) + Math.abs(dy) < 4) return;
      d.bouge = true;
      setSurvol(null);
      if (d.k === 'pan') {
        setTx(d.tx0 + dx / d.echelle);
        setTy(d.ty0 + dy / d.echelle);
      } else {
        setDeplacements((prec) => ({
          ...prec,
          [d.id]: {
            x: Math.max(30, Math.min(L - 30, d.x0 + dx / d.echelle / zoom)),
            y: Math.max(40, Math.min(H - 30, d.y0 + dy / d.echelle / zoom)),
          },
        }));
      }
    },
    [zoom]
  );

  const relacher = useCallback(() => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.bouge) return;
    // Clic simple : sélection (ou désélection sur le fond).
    if (d.k === 'nœud') {
      setSelection({ k: 'personnage', id: d.id });
      setRetour(null);
      setFeuille(true);
      setSurvol(null);
    } else if (selection) {
      setSelection(null);
      setRetour(null);
    }
  }, [selection]);

  const molette = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const g = geometrie();
      const nz = Math.max(0.5, Math.min(3, zoom * (e.deltaY < 0 ? 1.12 : 0.89)));
      const k = nz / zoom;
      const vx = (e.clientX - g.rect.left - g.ox) / g.echelle;
      const vy = (e.clientY - g.rect.top - g.oy) / g.echelle;
      setTx(vx - (vx - tx) * k);
      setTy(vy - (vy - ty) * k);
      setZoom(nz);
    },
    [zoom, tx, ty, geometrie]
  );

  const survoler = useCallback(
    (e: React.PointerEvent, k: 'n' | 'e', id: string) => {
      if (drag.current) return;
      const sv = toileRef.current;
      if (!sv) return;
      const rect = sv.getBoundingClientRect();
      setSurvol({ k, id, x: e.clientX - rect.left, y: e.clientY - rect.top });
    },
    []
  );

  const quitterSurvol = useCallback(() => setSurvol(null), []);

  const zoomVers = useCallback(
    (nzBrut: number) => {
      const nz = Math.max(0.5, Math.min(3, nzBrut));
      const k = nz / zoom;
      setTx(L / 2 - (L / 2 - tx) * k);
      setTy(H / 2 - (H / 2 - ty) * k);
      setZoom(nz);
    },
    [zoom, tx, ty]
  );

  const recentrer = useCallback(() => {
    setZoom(1);
    setTx(0);
    setTy(0);
  }, []);

  const replacer = useCallback(() => {
    setDeplacements({});
    recentrer();
  }, [recentrer]);

  const pleinEcran = useCallback(() => {
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen();
    } catch {
      /* indisponible */
    }
  }, []);

  /** Centre la caméra sur un point (localisation d'événement, focus). */
  const centrerSur = useCallback(
    (points: Position[]) => {
      if (points.length === 0) return;
      const mx = points.reduce((s, p) => s + p.x, 0) / points.length;
      const my = points.reduce((s, p) => s + p.y, 0) / points.length;
      setVue('graphe');
      setZoom(1.2);
      setTx(L / 2 - mx * 1.2);
      setTy(H / 2 - my * 1.2);
    },
    []
  );

  const ciblerPersonnage = useCallback(
    (id: string) => {
      const p = positions[id];
      if (p) centrerSur([p]);
      setFlashId(id);
      setRecherche('');
      setResultatsOuverts(false);
      setSelection({ k: 'personnage', id });
      setRetour(null);
      setFeuille(true);
      window.setTimeout(() => setFlashId(null), 2600);
    },
    [positions, centrerSur]
  );

  const choisirEvenement = useCallback(
    (e: EvenementGraphe) => {
      setSelection({ k: 'evenement', id: e.id });
      setRetour(null);
      setFeuille(true);
    },
    []
  );

  // ---------- Position lue depuis la progression locale ----------
  const [initFait, setInitFait] = useState(false);
  if (!initFait) {
    setInitFait(true);
    try {
      const brut = window.localStorage.getItem(CLEF_PROGRESSION);
      const p = brut ? assainirProgression(JSON.parse(brut)) : null;
      if (p && p.livreId === livreId && p.chapitreId) {
        const trouve = chapitres.find((c) => c.id === p.chapitreId);
        if (trouve) setChapitreLu(trouve.position);
      }
    } catch {
      /* progression locale illisible : portée maximale */
    }
  }

  // ---------- Édition (propriétaire) ----------
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<{ ton: 'ok' | 'erreur'; texte: string } | null>(null);

  const poster = async (corps: Record<string, unknown>) => {
    setEnCours(true);
    setMessage(null);
    try {
      const reponse = await fetch(`/api/livres/${livreId}/graphe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      });
      const donnees = (await reponse.json().catch(() => ({}))) as { erreur?: string };
      if (!reponse.ok) {
        setMessage({ ton: 'erreur', texte: donnees.erreur ?? 'Échec de l’ajout.' });
        return false;
      }
      return true;
    } catch {
      setMessage({ ton: 'erreur', texte: 'Réseau indisponible.' });
      return false;
    } finally {
      setEnCours(false);
    }
  };

  const supprimer = async (type: 'personnage' | 'relation' | 'evenement', id: string) => {
    setEnCours(true);
    try {
      await fetch(`/api/livres/${livreId}/graphe?type=${type}&id=${id}`, {
        method: 'DELETE',
      });
      if (selection?.id === id) {
        setSelection(null);
        setFeuille(false);
      }
      await recharger();
    } finally {
      setEnCours(false);
    }
  };

  // Fiches sélectionnées
  const persoChoisi =
    selection?.k === 'personnage'
      ? graphe?.noeuds.find((n) => n.id === selection.id) ?? null
      : null;
  const relationChoisie =
    selection?.k === 'relation' ? aretesFiltrees.find((a) => a.id === selection.id) ?? null : null;
  const evenementChoisi =
    selection?.k === 'evenement'
      ? evenementsFiltres.find((e) => e.id === selection.id) ?? null
      : null;

  const relationsDePerso = useCallback(
    (id: string) => aretesFiltrees.filter((a) => a.origineId === id || a.destinationId === id),
    [aretesFiltrees]
  );

  const evenementsDePerso = useCallback(
    (id: string) => evenementsFiltres.filter((e) => e.personnageIds.includes(id)),
    [evenementsFiltres]
  );

  const infoSurvol = useMemo(() => {
    if (!survol || !graphe) return null;
    if (survol.k === 'n') {
      const n = graphe.noeuds.find((x) => x.id === survol.id);
      return n
        ? {
            titre: n.nom,
            sous: `${libelleRole(n.role)} · ${degreParId[n.id] ?? 0} relation${
              (degreParId[n.id] ?? 0) > 1 ? 's' : ''
            }`,
          }
        : null;
    }
    const a = aretesFiltrees.find((x) => x.id === survol.id);
    return a
      ? {
          titre: phraseRelation(a, nomDe),
          sous: `${TYPES_RELATION[a.type].libelle} · ${FIABILITES[a.fiabilite].libelle}${
            a.etat ? ` · ${a.etat}` : ''
          }`,
        }
      : null;
  }, [survol, graphe, aretesFiltrees, degreParId, nomDe]);

  const nbFiltres =
    (principauxSeuls ? 1 : 0) +
    (fiabiliteFiltre !== 'all' ? 1 : 0) +
    Object.values(typesInactifs).filter(Boolean).length;

  const personnagesTries = useMemo(() => {
    const liste = [...noeudsFiltres];
    liste.sort(
      (a, b) =>
        (degreParId[b.id] ?? 0) - (degreParId[a.id] ?? 0) || a.nom.localeCompare(b.nom, 'fr')
    );
    return liste;
  }, [noeudsFiltres, degreParId]);

  return (
    <div className="space-y-6">
      {/* ===== Barre d'outils ===== */}
      <div className="velours p-4 rounded-2xl flex flex-wrap items-center gap-3">
        <label className="text-xs text-encre-500">
          Afficher jusqu’au chapitre
          <select
            className="champ-sombre select-sombre ml-2 rounded-lg border border-nuit-700 bg-nuit-850 px-2.5 py-2 text-sm text-encre-100"
            value={chapitreLu}
            onChange={(e) => {
              setChapitreLu(Number(e.target.value));
              setSelection(null);
              setFeuille(false);
            }}
          >
            <option value={0}>Depuis le début uniquement</option>
            {chapitres.map((c) => (
              <option key={c.id} value={c.position}>
                Chapitre {c.position} — {c.titre.slice(0, 40)}
              </option>
            ))}
            <option value={positionMax}>Tout ({positionMax})</option>
          </select>
        </label>

        {/* Recherche */}
        <div className="relative">
          <input
            type="text"
            value={recherche}
            onChange={(e) => {
              setRecherche(e.target.value);
              setResultatsOuverts(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && correspondances[0]) ciblerPersonnage(correspondances[0].id);
              if (e.key === 'Escape') {
                setRecherche('');
                setResultatsOuverts(false);
              }
            }}
            placeholder="Personnage, rôle, description…"
            aria-label="Rechercher un personnage"
            className="champ-sombre w-56 rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2 text-sm text-encre-100"
          />
          {resultatsOuverts && recherche.trim() && (
            <div className="absolute z-30 mt-1 w-72 velours rounded-xl border border-nuit-700 shadow-xl overflow-hidden">
              {correspondances.slice(0, 6).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => ciblerPersonnage(c.id)}
                  className="w-full text-left px-3 py-2.5 text-sm text-encre-100 hover:bg-nuit-800 flex items-center gap-2"
                >
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: COULEURS_ROLE[c.role] }}
                    aria-hidden="true"
                  />
                  <span className="truncate">
                    {c.nom} <span className="text-encre-500 text-xs">— {libelleRole(c.role)}</span>
                  </span>
                </button>
              ))}
              {correspondances.length === 0 && (
                <p className="px-3 py-2.5 text-sm text-encre-500">
                  Aucun personnage trouvé à cette portée.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-1 ml-auto" role="group" aria-label="Vue du graphe">
          {(
            [
              ['graphe', 'Graphe'],
              ['personnages', 'Personnages'],
              ['chronologie', 'Chronologie'],
            ] as const
          ).map(([v, libelle]) => (
            <button
              key={v}
              type="button"
              onClick={() => setVue(v)}
              aria-pressed={vue === v}
              className={`min-h-10 text-xs px-3 ${vue === v ? 'bouton-principal' : 'bouton-fantome'}`}
            >
              {libelle}
            </button>
          ))}
        </div>
      </div>

      {/* ===== Outils de la toile ===== */}
      {vue === 'graphe' && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <input
              type="text"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Filtrer les personnages…"
              aria-label="Filtrer les personnages affichés"
              className="champ-sombre w-52 rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2 text-sm text-encre-100"
            />
          </div>
          <button type="button" className="bouton-fantome min-h-10 text-xs px-3" aria-label="Dézoomer" onClick={() => zoomVers(zoom / 1.25)}>
            −
          </button>
          <span className="text-xs text-encre-500 chiffres-tabulaires w-12 text-center" aria-live="polite">
            {Math.round(zoom * 100)} %
          </span>
          <button type="button" className="bouton-fantome min-h-10 text-xs px-3" aria-label="Zoomer" onClick={() => zoomVers(zoom * 1.25)}>
            +
          </button>
          <button type="button" className="bouton-fantome min-h-10 text-xs px-3" onClick={recentrer}>
            Recentrer
          </button>
          <button type="button" className="bouton-fantome min-h-10 text-xs px-3" onClick={replacer}>
            Réinitialiser la disposition
          </button>
          <button type="button" className="bouton-fantome min-h-10 text-xs px-3" onClick={pleinEcran}>
            Plein écran
          </button>
          <button
            type="button"
            className="bouton-fantome min-h-10 text-xs px-3"
            aria-expanded={aideOuverte}
            onClick={() => setAideOuverte((v) => !v)}
          >
            Aide
          </button>
          <button
            type="button"
            className={`min-h-10 text-xs px-3 ${
              suggestionsOuvertes ? 'bouton-principal' : 'bouton-fantome'
            }`}
            aria-pressed={suggestionsOuvertes}
            onClick={() => setSuggestionsOuvertes((v) => !v)}
          >
            Suggestions
            {graphe && compteurSuggestions > 0 ? ` · ${compteurSuggestions}` : ''}
          </button>
          <button
            type="button"
            className={`min-h-10 text-xs px-3 ${portraits ? 'bouton-principal' : 'bouton-fantome'}`}
            aria-pressed={portraits}
            onClick={() => setPortraits((v) => !v)}
          >
            Portraits
          </button>
          <button
            type="button"
            className={`min-h-10 text-xs px-3 ${toujoursLabels ? 'bouton-principal' : 'bouton-fantome'}`}
            aria-pressed={toujoursLabels}
            onClick={() => setToujoursLabels((v) => !v)}
          >
            Libellés
          </button>
          <button
            type="button"
            className={`min-h-10 text-xs px-3 ${principauxSeuls ? 'bouton-principal' : 'bouton-fantome'}`}
            aria-pressed={principauxSeuls}
            onClick={() => setPrincipauxSeuls((v) => !v)}
          >
            Principaux
          </button>
          <button
            type="button"
            className={`min-h-10 text-xs px-3 ${fiabiliteFiltre === 'unsure' ? 'bouton-principal' : 'bouton-fantome'}`}
            aria-pressed={fiabiliteFiltre === 'unsure'}
            onClick={() => setFiabiliteFiltre((v) => (v === 'unsure' ? 'all' : 'unsure'))}
          >
            Incertaines seules
          </button>
          <button
            type="button"
            className={`min-h-10 text-xs px-3 ${filtresOuverts ? 'bouton-principal' : 'bouton-fantome'}`}
            aria-expanded={filtresOuverts}
            onClick={() => setFiltresOuverts((v) => !v)}
          >
            Filtres{nbFiltres > 0 ? ` · ${nbFiltres}` : ''}
          </button>
        </div>
      )}

      {filtresOuverts && (
        <div className="velours p-4 rounded-2xl space-y-3" role="dialog" aria-label="Filtres du graphe">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(TYPES_RELATION) as TypeRelation[]).map((t) => {
              const compte = graphe?.aretes.filter((a) => a.type === t).length ?? 0;
              return (
                <button
                  key={t}
                  type="button"
                  className={`text-xs px-3 py-1.5 rounded-full border min-h-9 ${
                    typesInactifs[t]
                      ? 'border-nuit-700 text-encre-500'
                      : 'border-nuit-600 text-encre-100'
                  }`}
                  aria-pressed={!typesInactifs[t]}
                  onClick={() =>
                    setTypesInactifs((prec) => ({ ...prec, [t]: !prec[t] }))
                  }
                >
                  <i
                    className="inline-block w-2.5 h-2.5 rounded-full mr-1.5"
                    style={{ backgroundColor: TYPES_RELATION[t].couleur, opacity: typesInactifs[t] ? 0.3 : 1 }}
                    aria-hidden="true"
                  />
                  {TYPES_RELATION[t].libelle}
                  {compte > 0 ? ` · ${compte}` : ''}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-encre-500">
            Plein : fait · tirets : déduction · pointillé : hypothèse · pointillé fin :
            incertain · épaisseur : intensité · flèches : sens du lien.
          </p>
          <button
            type="button"
            className="bouton-fantome text-xs min-h-9 px-3"
            onClick={() => {
              setTypesInactifs({});
              setPrincipauxSeuls(false);
              setFiabiliteFiltre('all');
              setRecherche('');
              replacer();
              setSelection(null);
            }}
          >
            Réinitialiser les filtres et la vue
          </button>
        </div>
      )}

      {/* ===== Erreur / chargement ===== */}
      {erreur && <p className="text-sm text-grenat-400">{erreur}</p>}
      {chargement && (
        <p className="text-sm text-encre-500 animate-pouls-doux">Chargement de la toile…</p>
      )}

      {/* ===== Contenu ===== */}
      {graphe && !chargement && (
        <>
          {graphe.masquees > 0 && (
            <p className="text-xs text-encre-500 italic border border-dashed border-nuit-700 rounded-lg px-4 py-3">
              {graphe.masquees} élément{graphe.masquees > 1 ? 's' : ''} masqué
              {graphe.masquees > 1 ? 's' : ''} : au-delà du chapitre choisi, rien ne quitte
              la base. Aucune fuite par construction.
            </p>
          )}

          {/* ---------- AIDE (mode d'emploi) ---------- */}
          {aideOuverte && <ModaleAide fermer={() => setAideOuverte(false)} />}

          {/* ---------- SUGGESTIONS LOCALES (calculées, sans IA) ---------- */}
          {suggestionsOuvertes && (
            <PanneauSuggestions
              graphe={graphe}
              estProprietaire={estProprietaire}
              preRemplir={(origineId, destinationId) => {
                setSuggestionRelation({ origineId, destinationId });
                setSuggestionsOuvertes(false);
              }}
            />
          )}

          {/* ---------- VUE GRAPHE ---------- */}
          {vue === 'graphe' &&
            (noeudsFiltres.length === 0 ? (
              <p className="velours p-6 rounded-2xl text-sm text-encre-300 italic">
                {estProprietaire
                  ? 'Votre toile est vide à cette portée : ajoutez vos personnages ci-dessous.'
                  : 'Aucun personnage couvert à cette portée.'}
              </p>
            ) : (
              <div className="velours p-4 rounded-2xl relative">
                <svg
                  ref={toileRef}
                  viewBox={`0 0 ${L} ${H}`}
                  preserveAspectRatio="xMidYMid meet"
                  className="mx-auto w-full max-w-4xl touch-none select-none"
                  role="img"
                  aria-label={`Toile de ${noeudsFiltres.length} personnages et ${aretesVues.length} relations. La vue Personnages et la liste offrent une alternative textuelle.`}
                  onPointerMove={deplacer}
                  onPointerUp={relacher}
                  onPointerLeave={relacher}
                  onPointerCancel={relacher}
                  onWheel={molette}
                >
                  <defs>
                    {(Object.keys(TYPES_RELATION) as TypeRelation[]).map((t) => (
                      <marker
                        key={t}
                        id={`fleche-${t}`}
                        viewBox="0 0 10 10"
                        refX={9}
                        refY={5}
                        markerWidth={11}
                        markerHeight={11}
                        markerUnits="userSpaceOnUse"
                        orient="auto-start-reverse"
                      >
                        <path d="M0 0L10 5L0 10z" style={{ fill: TYPES_RELATION[t].couleur }} />
                      </marker>
                    ))}
                  </defs>

                  {/* Fond : déplacement de la caméra */}
                  <rect
                    x={-2000}
                    y={-2000}
                    width={5000}
                    height={5000}
                    style={{ fill: 'transparent', cursor: 'move' }}
                    onPointerDown={fondPresser}
                  />

                  <g transform={`translate(${tx} ${ty}) scale(${zoom})`}>
                    {aretesVues.map((v) => (
                      <g key={v.arete.id} style={{ opacity: v.opacite }}>
                        {v.selectionnee && (
                          <path
                            d={v.d}
                            style={{
                              fill: 'none',
                              stroke: v.couleur,
                              strokeWidth: v.largeur + 7,
                              opacity: 0.28,
                            }}
                          />
                        )}
                        <path
                          d={v.d}
                          style={{
                            fill: 'none',
                            stroke: v.couleur,
                            strokeWidth: v.largeur,
                            strokeDasharray: v.tirets === 'none' ? undefined : v.tirets,
                            strokeLinecap: 'round',
                            markerEnd: v.flecheFin ? `url(#fleche-${v.arete.type})` : undefined,
                            markerStart: v.flecheDebut ? `url(#fleche-${v.arete.type})` : undefined,
                          }}
                        />
                        <path
                          className="cursor-pointer"
                          d={v.d}
                          style={{ fill: 'none', stroke: 'transparent', strokeWidth: 14 }}
                          onClick={() => {
                            const persoPrecedent =
                              selection?.k === 'personnage' ? selection : null;
                            if (persoPrecedent) setRetour(persoPrecedent);
                            setSelection({ k: 'relation', id: v.arete.id });
                            setFeuille(true);
                            setSurvol(null);
                          }}
                          onPointerEnter={(e) => survoler(e, 'e', v.arete.id)}
                          onPointerLeave={quitterSurvol}
                        />
                        <circle
                          cx={v.mx}
                          cy={v.my}
                          r={v.selectionnee ? 6 : 4}
                          style={{ fill: v.couleur, stroke: '#1a0f15', strokeWidth: 2, pointerEvents: 'none' }}
                        />
                        {v.labelVisible && (
                          <text
                            x={v.mx}
                            y={v.my - 10}
                            textAnchor="middle"
                            style={{ fontSize: 12, fill: 'var(--color-encre-300, #d8d2d6)' }}
                          >
                            {TYPES_RELATION[v.arete.type].libelle}
                            {v.arete.etat ? ` · ${v.arete.etat}` : ''}
                          </text>
                        )}
                      </g>
                    ))}

                    {noeudsFiltres.map((n) => {
                      const p = positions[n.id] ?? { x: L / 2, y: H / 2 };
                      const r = rayonDe(n);
                      const principal = n.importance === 3;
                      const choisi = selection?.k === 'personnage' && selection.id === n.id;
                      const rechercheActive = correspondances.length > 0 && recherche.trim().length > 0;
                      const eclaire = rechercheActive
                        ? correspondances.some((c) => c.id === n.id)
                        : misEnAvant
                          ? misEnAvant.has(n.id)
                          : true;
                      return (
                        <g
                          key={n.id}
                          transform={`translate(${p.x} ${p.y})`}
                          style={{ opacity: eclaire ? 1 : 0.16, cursor: 'grab' }}
                          tabIndex={0}
                          role="button"
                          aria-label={`${n.nom}, ${libelleRole(n.role)}, ${
                            degreParId[n.id] ?? 0
                          } relations. Appuyez sur Entrée pour ouvrir la fiche.`}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              ciblerPersonnage(n.id);
                            }
                          }}
                          onPointerDown={(e) => noeudPresser(e, n)}
                          onPointerEnter={(e) => survoler(e, 'n', n.id)}
                          onPointerLeave={quitterSurvol}
                        >
                          {flashId === n.id && (
                            <circle r={r + 12} style={{ fill: 'none', stroke: '#ff5a73', strokeWidth: 3 }} />
                          )}
                          {choisi && (
                            <circle
                              r={r + 9}
                              style={{
                                fill: 'none',
                                stroke: '#ff5a73',
                                strokeWidth: 2.5,
                                filter: 'drop-shadow(0 0 6px rgba(255, 64, 96, 0.9))',
                              }}
                            />
                          )}
                          <circle
                            r={r + 4}
                            style={{
                              fill: 'none',
                              stroke: COULEURS_ROLE[n.role],
                              strokeWidth: 1.5,
                              strokeDasharray: '2 3',
                            }}
                          />
                          <circle
                            r={r}
                            style={{
                              fill: '#1a0f15',
                              stroke: principal ? '#f2e8e5' : '#6b5560',
                              strokeWidth: principal ? 2 : 1.2,
                            }}
                          />
                          {portraits ? (
                            <g style={{ pointerEvents: 'none' }}>
                              <circle
                                cx={0}
                                cy={-r * 0.2}
                                r={r * 0.3}
                                style={{ fill: COULEURS_ROLE[n.role] }}
                              />
                              <ellipse
                                cx={0}
                                cy={r * 0.62}
                                rx={r * 0.62}
                                ry={r * 0.5}
                                style={{ fill: COULEURS_ROLE[n.role] }}
                              />
                            </g>
                          ) : (
                            <text
                              dy=".35em"
                              textAnchor="middle"
                              style={{ pointerEvents: 'none', fontSize: Math.round(r * 0.8), fill: '#f2e8e5' }}
                            >
                              {initiales(n.nom)}
                            </text>
                          )}
                          <text
                            y={r + 17}
                            textAnchor="middle"
                            style={{ pointerEvents: 'none', fontSize: 12, fill: 'var(--color-encre-200, #e8e2e6)' }}
                          >
                            {n.nom.slice(0, 20)}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                </svg>

                {/* Infobulle */}
                {infoSurvol && survol && (
                  <div
                    className="pointer-events-none absolute z-20 velours border border-nuit-600 rounded-lg px-3 py-1.5 text-xs shadow-xl"
                    style={{ left: survol.x + 14, top: survol.y + 14 }}
                  >
                    <b className="text-encre-100">{infoSurvol.titre}</b>
                    <span className="block text-encre-400">{infoSurvol.sous}</span>
                  </div>
                )}

                <p className="text-[11px] text-encre-500 text-center mt-2">
                  Glisser un personnage : le déplacer · glisser le fond : déplacer la toile ·
                  molette : zoom ({Math.round(zoom * 100)} %)
                </p>

                {/* Légende cliquable */}
                {legende.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-2 mt-3">
                    {legende.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        className={`text-[11px] px-2.5 py-1 rounded-full border min-h-8 ${
                          typesInactifs[l.id]
                            ? 'border-nuit-700 text-encre-500'
                            : 'border-nuit-600 text-encre-200'
                        }`}
                        aria-pressed={!typesInactifs[l.id]}
                        onClick={() =>
                          setTypesInactifs((prec) => ({ ...prec, [l.id]: !prec[l.id] }))
                        }
                      >
                        <i
                          className="inline-block w-2 h-2 rounded-full mr-1"
                          style={{ backgroundColor: l.couleur, opacity: typesInactifs[l.id] ? 0.3 : 1 }}
                          aria-hidden="true"
                        />
                        {l.libelle} · {l.compte}
                      </button>
                    ))}
                  </div>
                )}

                {/* Alternative textuelle */}
                <ul className="sr-only">
                  {aretesVues.map((v) => (
                    <li key={v.arete.id}>
                      {phraseRelation(v.arete, nomDe)} — {TYPES_RELATION[v.arete.type].libelle}
                      {v.arete.etat ? `, ${v.arete.etat}` : ''} (
                      {FIABILITES[v.arete.fiabilite].libelle})
                    </li>
                  ))}
                </ul>
              </div>
            ))}

          {/* ---------- VUE PERSONNAGES ---------- */}
          {vue === 'personnages' && (
            <div className="velours rounded-2xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-encre-500 text-xs border-b border-nuit-700">
                    <th className="px-4 py-3 font-normal">Personnage</th>
                    <th className="px-4 py-3 font-normal">Rôle</th>
                    <th className="px-4 py-3 font-normal">Importance</th>
                    <th className="px-4 py-3 font-normal">Relations</th>
                    <th className="px-4 py-3 font-normal" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {personnagesTries.map((n) => (
                    <tr key={n.id} className="border-b border-nuit-800 last:border-0">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          className="flex items-center gap-2 text-left hover:underline"
                          onClick={() => ciblerPersonnage(n.id)}
                        >
                          <span
                            className="inline-block w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: COULEURS_ROLE[n.role] }}
                            aria-hidden="true"
                          />
                          <span className="text-encre-100">{n.nom}</span>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-encre-400">{libelleRole(n.role)}</td>
                      <td className="px-4 py-3 text-encre-400">
                        {n.importance === 3 ? 'Principale' : n.importance === 2 ? 'Notable' : 'Secondaire'}
                      </td>
                      <td className="px-4 py-3 text-encre-400 chiffres-tabulaires">
                        {degreParId[n.id] ?? 0}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          className="bouton-fantome text-xs min-h-8 px-2"
                          onClick={() => {
                            setSelection({ k: 'personnage', id: n.id });
                            setRetour(null);
                            setFeuille(true);
                          }}
                        >
                          Fiche
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {personnagesTries.length === 0 && (
                <p className="p-6 text-sm text-encre-300 italic">
                  Aucun personnage à cette portée et avec ces filtres.
                </p>
              )}
            </div>
          )}

          {/* ---------- VUE CHRONOLOGIE ---------- */}
          {vue === 'chronologie' && (
            <ol className="space-y-2">
              {evenementsFiltres.map((e) => {
                const genre = GENRES_EVENEMENT[e.genre];
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => choisirEvenement(e)}
                      className="w-full text-left velours p-4 rounded-2xl flex flex-wrap items-center gap-x-3 gap-y-1 hover:border-nuit-600"
                    >
                      <span className="text-[11px] text-encre-500 chiffres-tabulaires shrink-0">
                        Ch. {e.position}
                      </span>
                      <i
                        className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: genre.couleur }}
                        aria-hidden="true"
                      />
                      <span
                        className="text-[11px] uppercase tracking-wide shrink-0"
                        style={{ color: genre.couleur }}
                      >
                        {genre.libelle}
                      </span>
                      <span className="text-encre-100">{e.titre}</span>
                      {e.texte && (
                        <span className="text-encre-500 text-xs w-full">{e.texte}</span>
                      )}
                      {e.personnageIds.length > 0 && (
                        <span className="flex flex-wrap gap-1.5 w-full">
                          {e.personnageIds.map((id) => (
                            <span
                              key={id}
                              className="text-[11px] px-2 py-0.5 rounded-full border border-nuit-700 text-encre-300"
                            >
                              {nomDe(id)}
                            </span>
                          ))}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
              {evenementsFiltres.length === 0 && (
                <li className="velours p-6 rounded-2xl text-sm text-encre-300 italic">
                  Aucun événement à cette portée.
                  {estProprietaire
                    ? ' Consignez les moments qui comptent avec le formulaire ci-dessous.'
                    : ''}
                </li>
              )}
            </ol>
          )}

          {/* ===== Fiche (panneau latéral) ===== */}
          {(persoChoisi || relationChoisie || evenementChoisi) && feuille && (
            <FicheGraphe
              perso={persoChoisi}
              relation={relationChoisie}
              evenement={evenementChoisi}
              nomDe={nomDe}
              relationsDe={relationsDePerso}
              evenementsDe={evenementsDePerso}
              retour={retour}
              onRetour={() => {
                if (retour) {
                  setSelection(retour);
                  setRetour(null);
                }
              }}
              ouvrirPersonnage={(id) => {
                setSelection({ k: 'personnage', id });
                setRetour(null);
              }}
              ouvrirRelation={(id) => {
                setSelection({ k: 'relation', id });
                setRetour(null);
              }}
              ouvrirEvenement={(e) => {
                setSelection({ k: 'evenement', id: e.id });
                setRetour(null);
              }}
              localiser={(ids) => {
                const points = ids
                  .map((id) => positions[id])
                  .filter((p): p is Position => Boolean(p));
                centrerSur(points);
                setFeuille(false);
              }}
              estProprietaire={estProprietaire}
              enCours={enCours}
              supprimer={supprimer}
              fermer={() => setFeuille(false)}
            />
          )}

          {message && (
            <p
              role="status"
              className={`text-xs ${message.ton === 'ok' ? 'text-encre-300' : 'text-grenat-400'}`}
            >
              {message.texte}
            </p>
          )}

          {/* ===== Édition (propriétaire) ===== */}
          {estProprietaire && (
            <EditionGraphe
              chapitres={chapitres}
              personnages={graphe.noeuds}
              relations={graphe.aretes}
              enCours={enCours}
              poster={poster}
              supprimer={supprimer}
              recharge={recharger}
              suggestion={suggestionRelation}
              onSuggestionAppliquee={() => setSuggestionRelation(null)}
            />
          )}
        </>
      )}
    </div>
  );
}

// ============================================================
// Sous-composants
// ============================================================

const COULEURS_ROLE: Record<string, string> = {
  protagoniste: '#a3515f',
  antagoniste: '#6b4a8f',
  allie: '#3f6f5f',
  secondaire: '#6f6a75',
  autre: '#8a8391',
};

function initiales(nom: string): string {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m[0]?.toUpperCase() ?? '')
    .join('');
}

interface FicheProps {
  perso: NoeudGraphe | null;
  relation: AreteGraphe | null;
  evenement: EvenementGraphe | null;
  nomDe: (id: string) => string;
  relationsDe: (id: string) => AreteGraphe[];
  evenementsDe: (id: string) => EvenementGraphe[];
  retour: Selection;
  onRetour: () => void;
  ouvrirPersonnage: (id: string) => void;
  ouvrirRelation: (id: string) => void;
  ouvrirEvenement: (e: EvenementGraphe) => void;
  localiser: (ids: string[]) => void;
  estProprietaire: boolean;
  enCours: boolean;
  supprimer: (type: 'personnage' | 'relation' | 'evenement', id: string) => void;
  fermer: () => void;
}

function FicheGraphe({
  perso,
  relation,
  evenement,
  nomDe,
  relationsDe,
  evenementsDe,
  retour,
  onRetour,
  ouvrirPersonnage,
  ouvrirRelation,
  ouvrirEvenement,
  localiser,
  estProprietaire,
  enCours,
  supprimer,
  fermer,
}: FicheProps) {
  return (
    <aside
      className="velours p-5 rounded-2xl border border-nuit-700 space-y-4"
      aria-label="Fiche du graphe"
    >
      <div className="flex items-center justify-between">
        <h2 className="sur-titre text-encre-300">Fiche</h2>
        <button type="button" className="bouton-fantome text-xs min-h-8 px-2" onClick={fermer}>
          Fermer
        </button>
      </div>

      {/* --- Fiche personnage --- */}
      {perso && (
        <div className="space-y-4">
          {retour && retour.k === 'personnage' && (
            <button type="button" className="bouton-fantome text-xs min-h-8 px-2" onClick={onRetour}>
              ← {nomDe(retour.id)}
            </button>
          )}
          <div className="flex items-center gap-3">
            <span
              className="inline-block w-10 h-10 rounded-full border-2 shrink-0"
              style={{
                backgroundColor: COULEURS_ROLE[perso.role],
                borderColor: perso.importance === 3 ? '#f2e8e5' : '#6b5560',
              }}
              aria-hidden="true"
            />
            <div>
              <p className="font-display text-lg text-encre-100">{perso.nom}</p>
              <p className="text-xs text-encre-500">
                {libelleRole(perso.role)} ·{' '}
                {perso.importance === 3
                  ? 'Principale'
                  : perso.importance === 2
                    ? 'Notable'
                    : 'Secondaire'}
                {' · '}
                {perso.premierePosition
                  ? `apparaît au chapitre ${perso.premierePosition}`
                  : 'présent dès le début'}
              </p>
            </div>
          </div>
          {perso.description && (
            <p className="text-sm text-encre-300">{perso.description}</p>
          )}
          <section className="space-y-2">
            <h3 className="text-xs uppercase tracking-wide text-encre-500">
              Relations directes · {relationsDe(perso.id).length}
            </h3>
            {relationsDe(perso.id).map((a) => {
              const autre = a.origineId === perso.id ? a.destinationId : a.origineId;
              const def = TYPES_RELATION[a.type];
              return (
                <button
                  key={a.id}
                  type="button"
                  className="w-full text-left flex items-center gap-2 rounded-lg border border-nuit-700 px-3 py-2 text-sm hover:border-nuit-600"
                  onClick={() => ouvrirRelation(a.id)}
                >
                  <i
                    className="inline-block w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: def.couleur }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate">
                    <b className="text-encre-100">{nomDe(autre)}</b>
                    <span className="block text-[11px] text-encre-500 truncate">
                      {a.libelle}
                      {a.etat ? ` · ${a.etat}` : ''}
                    </span>
                  </span>
                  <span
                    className="text-[11px] shrink-0"
                    style={{ color: def.couleur }}
                    title={FIABILITES[a.fiabilite].libelle}
                  >
                    {FIABILITES[a.fiabilite].libelle}
                  </span>
                </button>
              );
            })}
            {relationsDe(perso.id).length === 0 && (
              <p className="text-xs text-encre-500 italic">Aucune relation à cette portée.</p>
            )}
          </section>
          {evenementsDe(perso.id).length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs uppercase tracking-wide text-encre-500">
                Événements le concernant
              </h3>
              {evenementsDe(perso.id).map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className="w-full text-left text-sm text-encre-300 rounded-lg border border-nuit-700 px-3 py-2 hover:border-nuit-600"
                  onClick={() => ouvrirEvenement(e)}
                >
                  <span className="text-[11px] text-encre-500 mr-2">Ch. {e.position}</span>
                  {e.titre}
                </button>
              ))}
            </section>
          )}
          {estProprietaire && (
            <button
              type="button"
              disabled={enCours}
              className="bouton-fantome text-xs min-h-9 px-3 text-grenat-400"
              onClick={() => supprimer('personnage', perso.id)}
            >
              Retirer ce personnage
            </button>
          )}
        </div>
      )}

      {/* --- Fiche relation --- */}
      {relation && (
        <div className="space-y-4">
          {retour && retour.k === 'personnage' && (
            <button type="button" className="bouton-fantome text-xs min-h-8 px-2" onClick={onRetour}>
              ← {nomDe(retour.id)}
            </button>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="text-[11px] px-2 py-0.5 rounded-full border"
              style={{
                color: TYPES_RELATION[relation.type].couleur,
                borderColor: TYPES_RELATION[relation.type].couleur,
              }}
            >
              {TYPES_RELATION[relation.type].libelle}
            </span>
            <span className="text-[11px] text-encre-500">
              {relation.premierePosition
                ? `révélée au chapitre ${relation.premierePosition}`
                : 'présente dès le début'}
            </span>
          </div>
          <p className="font-display text-lg text-encre-100">
            {phraseRelation(relation, nomDe)}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="bouton-fantome text-xs min-h-9 px-3"
              onClick={() => ouvrirPersonnage(relation.origineId)}
            >
              {nomDe(relation.origineId)}
            </button>
            <button
              type="button"
              className="bouton-fantome text-xs min-h-9 px-3"
              onClick={() => ouvrirPersonnage(relation.destinationId)}
            >
              {nomDe(relation.destinationId)}
            </button>
            <button
              type="button"
              className="bouton-fantome text-xs min-h-9 px-3"
              onClick={() => localiser([relation.origineId, relation.destinationId])}
            >
              Localiser sur la toile
            </button>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-encre-500">Fiabilité</dt>
              <dd className="text-encre-200">{FIABILITES[relation.fiabilite].libelle}</dd>
            </div>
            <div>
              <dt className="text-xs text-encre-500">État</dt>
              <dd className="text-encre-200">{relation.etat ?? '—'}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-encre-500">
                Intensité {relation.intensite} sur 5
              </dt>
              <dd className="flex gap-1 mt-1" aria-hidden="true">
                {[1, 2, 3, 4, 5].map((n) => (
                  <i
                    key={n}
                    className={`inline-block w-5 h-1.5 rounded-full ${
                      n <= relation.intensite ? 'bg-grenat-500' : 'bg-nuit-700'
                    }`}
                  />
                ))}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-encre-500 italic">
            {FIABILITES[relation.fiabilite].description}.
          </p>
          {estProprietaire && (
            <button
              type="button"
              disabled={enCours}
              className="bouton-fantome text-xs min-h-9 px-3 text-grenat-400"
              onClick={() => supprimer('relation', relation.id)}
            >
              Retirer cette relation
            </button>
          )}
        </div>
      )}

      {/* --- Fiche événement --- */}
      {evenement && (
        <div className="space-y-4">
          {(() => {
            const genre = GENRES_EVENEMENT[evenement.genre];
            return (
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="text-[11px] px-2 py-0.5 rounded-full border"
                  style={{ color: genre.couleur, borderColor: genre.couleur }}
                >
                  {genre.libelle}
                </span>
                <span className="text-[11px] text-encre-500">
                  Chapitre {evenement.position}
                </span>
              </div>
            );
          })()}
          <p className="font-display text-lg text-encre-100">{evenement.titre}</p>
          {evenement.texte && <p className="text-sm text-encre-300">{evenement.texte}</p>}
          {evenement.personnageIds.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {evenement.personnageIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  className="bouton-fantome text-xs min-h-8 px-2"
                  onClick={() => ouvrirPersonnage(id)}
                >
                  {nomDe(id)}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="bouton-principal text-xs min-h-9 px-3"
              onClick={() => localiser(evenement.personnageIds)}
            >
              Localiser sur la toile
            </button>
            {evenement.relationId && (
              <button
                type="button"
                className="bouton-fantome text-xs min-h-9 px-3"
                onClick={() => ouvrirRelation(evenement.relationId as string)}
              >
                Voir la relation
              </button>
            )}
          </div>
          {estProprietaire && (
            <button
              type="button"
              disabled={enCours}
              className="bouton-fantome text-xs min-h-9 px-3 text-grenat-400"
              onClick={() => supprimer('evenement', evenement.id)}
            >
              Retirer cet événement
            </button>
          )}
        </div>
      )}
    </aside>
  );
}


// ============================================================
// AIDE (mode d'emploi) — portage de la maquette (Modals.vue).
// Texte réel : décrit exactement les interactions livrées.
// ============================================================

function ModaleAide({ fermer }: { fermer: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Aide du graphe narratif"
      onClick={fermer}
    >
      <div
        className="velours max-w-xl w-full max-h-[85vh] overflow-y-auto p-6 rounded-2xl space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-xl text-encre-100">Lire la toile</h2>
        <ul className="space-y-2 text-sm text-encre-300">
          <li>
            <b className="text-encre-100">Se déplacer</b> : glissez le fond ; glissez un
            personnage pour le déplacer (la disposition est conservée à l'écran).
          </li>
          <li>
            <b className="text-encre-100">Zoomer</b> : molette ou boutons (50 à 300 %),
            recentrage et plein écran disponibles dans la barre.
          </li>
          <li>
            <b className="text-encre-100">Couleur des liens</b> : type de relation
            (famille, amour, rivalité…). LÉGENDE CLIQUABLE : un clic masque ou
            réaffiche un type.
          </li>
          <li>
            <b className="text-encre-100">Trait</b> : fiabilité — plein (fait), tirets
            (déduction), pointillé (hypothèse), pointillé fin (incertain) ;
            épaisseur = intensité ; flèches = sens.
          </li>
          <li>
            <b className="text-encre-100">Anti-spoilers</b> : la portée du graphe suit le
            chapitre choisi ; au-delà, rien ne quitte la base.
          </li>
          <li>
            <b className="text-encre-100">Trois vues</b> : la toile, la liste des
            personnages, la chronologie des événements.
          </li>
          <li>
            <b className="text-encre-100">Suggestions</b> : calculées localement sur ce que
            vous avez déjà documenté (personnages souvent ensemble sans lien
            connu, personnages isolés) — vous décidez, rien ne s'ajoute sans
            votre confirmation.
          </li>
        </ul>
        <button
          type="button"
          className="bouton-principal min-h-9 px-4 text-sm"
          onClick={fermer}
        >
          Compris
        </button>
      </div>
    </div>
  );
}

// ============================================================
// SUGGESTIONS LOCALES — portage de la maquette (propositions de
// mise à jour du graphe). TOUT est calculé depuis le graphe déjà
// filtré : co-apparitions sans relation, personnages isolés,
// relations fragiles. AUCUN appel à une IA, AUCUN contenu inventé.
// ============================================================

interface PropsSuggestions {
  graphe: GrapheFiltre;
  estProprietaire: boolean;
  preRemplir: (origineId: string, destinationId: string) => void;
}

function PanneauSuggestions({
  graphe,
  estProprietaire,
  preRemplir,
}: PropsSuggestions) {
  const suggestions = calculerSuggestions(graphe);
  const vide =
    suggestions.pairesSansLien.length === 0 &&
    suggestions.isoles.length === 0 &&
    suggestions.fragiles.length === 0;

  if (vide) {
    return (
      <p className="velours p-4 rounded-2xl text-sm text-encre-300">
        Aucune suggestion pour l'instant : documentez des personnages, des
        relations et des événements, et des pistes apparaîtront ici — calculées
        localement, jamais imposées.
      </p>
    );
  }

  return (
    <div className="velours p-4 rounded-2xl space-y-4">
      <div>
        <h2 className="sur-titre text-encre-300">Pistes à considérer</h2>
        <p className="text-xs text-encre-500 mt-1">
          Calculées localement à partir de ce que vous avez déjà documenté.
          Rien ne s'ajoute au graphe sans votre confirmation.
        </p>
      </div>

      {suggestions.pairesSansLien.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-encre-100">
            Souvent ensemble, sans lien documenté
          </h3>
          <ul className="space-y-1.5">
            {suggestions.pairesSansLien.map((paire) => (
              <li
                key={`${paire.origineId}-${paire.destinationId}`}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2 text-sm"
              >
                <span className="text-encre-100">
                  {paire.nomOrigine} · {paire.nomDestination}
                </span>
                <span className="text-xs text-encre-500">
                  {paire.occasions} événement{paire.occasions > 1 ? 's' : ''} en commun
                </span>
                {estProprietaire && (
                  <button
                    type="button"
                    className="bouton-fantome text-xs min-h-8 px-2 ml-auto border border-nuit-700"
                    onClick={() => preRemplir(paire.origineId, paire.destinationId)}
                  >
                    Préremplir une relation
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {suggestions.isoles.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-encre-100">
            Personnages encore isolés
          </h3>
          <ul className="flex flex-wrap gap-1.5">
            {suggestions.isoles.map((personnage) => (
              <li
                key={personnage.id}
                className="rounded-full border border-nuit-700 bg-nuit-850 px-3 py-1 text-xs text-encre-300"
              >
                {personnage.nom}
              </li>
            ))}
          </ul>
          <p className="text-xs text-encre-500">
            Reliez-les depuis le formulaire « Ajouter une relation » ci-dessous.
          </p>
        </section>
      )}

      {suggestions.fragiles.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-encre-100">
            Relations fragiles à consolider
          </h3>
          <ul className="flex flex-wrap gap-1.5">
            {suggestions.fragiles.map((relation) => (
              <li
                key={relation.id}
                className="rounded-full border border-nuit-700 bg-nuit-850 px-3 py-1 text-xs text-encre-300"
              >
                {relation.libelle}{' '}
                <span className="text-encre-500">
                  ({FIABILITES[relation.fiabilite].libelle.toLowerCase()})
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-encre-500">
            Une fois confirmées par votre lecture, remplacez-les par une
            relation plus fiable (fait ou déduction).
          </p>
        </section>
      )}
    </div>
  );
}

// ============================================================
// Édition enrichie (propriétaire)
// ============================================================
interface EditionProps {
  chapitres: ChapitreGraphe[];
  personnages: NoeudGraphe[];
  relations: AreteGraphe[];
  enCours: boolean;
  poster: (corps: Record<string, unknown>) => Promise<boolean>;
  supprimer: (type: 'personnage' | 'relation' | 'evenement', id: string) => void;
  recharge: () => Promise<void>;
  /** Préremplissage venant du panneau des suggestions. */
  suggestion: { origineId: string; destinationId: string } | null;
  onSuggestionAppliquee: () => void;
}

function EditionGraphe({
  chapitres,
  personnages,
  relations,
  enCours,
  poster,
  supprimer,
  recharge,
  suggestion,
  onSuggestionAppliquee,
}: EditionProps) {
  // Personnage
  const [nom, setNom] = useState('');
  const [role, setRole] = useState<(typeof ROLES)[number]>('secondaire');
  const [importance, setImportance] = useState(2);
  const [description, setDescription] = useState('');
  const [apparitionPerso, setApparitionPerso] = useState('');
  // Relation
  const [origineId, setOrigineId] = useState('');
  const [destinationId, setDestinationId] = useState('');
  const [libelle, setLibelle] = useState('');
  const [typeRelation, setTypeRelation] = useState<TypeRelation>('autre');
  const [sens, setSens] = useState<SensRelation>('none');
  const [intensite, setIntensite] = useState(2);
  const [etat, setEtat] = useState('');
  const [fiabilite, setFiabilite] = useState<Fiabilite>('fait');
  const [apparitionRelation, setApparitionRelation] = useState('');
  // Événement
  const [genreEve, setGenreEve] = useState<GenreEvenement>('rencontre');
  const [titreEve, setTitreEve] = useState('');
  const [texteEve, setTexteEve] = useState('');
  const [chapitreEve, setChapitreEve] = useState('');
  const [relationEve, setRelationEve] = useState('');
  const [cites, setCites] = useState<string[]>([]);

  const cls =
    'champ-sombre w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2.5 text-sm text-encre-100';

  // Préremplissage depuis les SUGGESTIONS locales : la paire proposée
  // remplit le formulaire de relation et le rend visible.
  useEffect(() => {
    if (!suggestion) return;
    setOrigineId(suggestion.origineId);
    setDestinationId(suggestion.destinationId);
    document
      .getElementById('titre-ajout-relation')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    onSuggestionAppliquee();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestion]);

  const ajouterPersonnage = async () => {
    if (
      await poster({
        type: 'personnage',
        nom,
        role,
        importance,
        description,
        premiereChapitreId: apparitionPerso || null,
      })
    ) {
      setNom('');
      setDescription('');
      setApparitionPerso('');
      await recharge();
    }
  };

  const ajouterRelation = async () => {
    if (
      await poster({
        type: 'relation',
        origineId,
        destinationId,
        libelle,
        typeRelation,
        sens,
        intensite,
        etat,
        fiabilite,
        premiereChapitreId: apparitionRelation || null,
      })
    ) {
      setLibelle('');
      setEtat('');
      setApparitionRelation('');
      await recharge();
    }
  };

  const ajouterEvenement = async () => {
    if (
      await poster({
        type: 'evenement',
        genre: genreEve,
        titre: titreEve,
        texte: texteEve,
        chapitreId: chapitreEve,
        relationId: relationEve || null,
        personnageIds: cites,
      })
    ) {
      setTitreEve('');
      setTexteEve('');
      setRelationEve('');
      setCites([]);
      await recharge();
    }
  };

  const basculerCite = (id: string) =>
    setCites((prec) => (prec.includes(id) ? prec.filter((x) => x !== id) : [...prec, id]));

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <section className="velours p-5 rounded-2xl space-y-3" aria-labelledby="titre-ajout-perso">
        <h2 id="titre-ajout-perso" className="sur-titre text-encre-300">
          Ajouter un personnage
        </h2>
        <input
          type="text"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="Nom du personnage…"
          className={cls}
        />
        <div className="grid grid-cols-2 gap-2">
          <select className={cls} value={role} onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])} aria-label="Rôle">
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {libelleRole(r)}
              </option>
            ))}
          </select>
          <select
            className={cls}
            value={importance}
            onChange={(e) => setImportance(Number(e.target.value))}
            aria-label="Importance"
          >
            <option value={3}>Principale</option>
            <option value={2}>Notable</option>
            <option value={1}>Secondaire</option>
          </select>
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Description courte (facultative)…"
          className={cls}
        />
        <select
          className={cls}
          value={apparitionPerso}
          onChange={(e) => setApparitionPerso(e.target.value)}
          aria-label="Première apparition"
        >
          <option value="">Présent dès le début</option>
          {chapitres.map((c) => (
            <option key={c.id} value={c.id}>
              Apparaît au chapitre {c.position} — {c.titre.slice(0, 36)}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={enCours || !nom.trim()}
          onClick={ajouterPersonnage}
          className="bouton-principal min-h-10 text-sm w-full disabled:opacity-40"
        >
          Ajouter à la toile
        </button>
      </section>

      <section className="velours p-5 rounded-2xl space-y-3" aria-labelledby="titre-ajout-relation">
        <h2 id="titre-ajout-relation" className="sur-titre text-encre-300">
          Relier deux personnages
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <select className={cls} value={origineId} onChange={(e) => setOrigineId(e.target.value)} aria-label="Personnage d'origine">
            <option value="">De…</option>
            {personnages.map((n) => (
              <option key={n.id} value={n.id}>
                {n.nom}
              </option>
            ))}
          </select>
          <select
            className={cls}
            value={destinationId}
            onChange={(e) => setDestinationId(e.target.value)}
            aria-label="Personnage de destination"
          >
            <option value="">…vers</option>
            {personnages.map((n) => (
              <option key={n.id} value={n.id}>
                {n.nom}
              </option>
            ))}
          </select>
        </div>
        <input
          type="text"
          value={libelle}
          onChange={(e) => setLibelle(e.target.value)}
          placeholder="Le lien (sœur de, traque, doit tout à…)…"
          className={cls}
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            className={cls}
            value={typeRelation}
            onChange={(e) => setTypeRelation(e.target.value as TypeRelation)}
            aria-label="Type de relation"
          >
            {(Object.keys(TYPES_RELATION) as TypeRelation[]).map((t) => (
              <option key={t} value={t}>
                {TYPES_RELATION[t].libelle}
              </option>
            ))}
          </select>
          <select className={cls} value={sens} onChange={(e) => setSens(e.target.value as SensRelation)} aria-label="Sens du lien">
            {SENS.map((s) => (
              <option key={s.valeur} value={s.valeur}>
                {s.libelle}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select
            className={cls}
            value={fiabilite}
            onChange={(e) => setFiabilite(e.target.value as Fiabilite)}
            aria-label="Fiabilité"
          >
            {(Object.keys(FIABILITES) as Fiabilite[]).map((f) => (
              <option key={f} value={f}>
                {FIABILITES[f].libelle}
              </option>
            ))}
          </select>
          <select
            className={cls}
            value={intensite}
            onChange={(e) => setIntensite(Number(e.target.value))}
            aria-label="Intensité"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                Intensité {n}
              </option>
            ))}
          </select>
        </div>
        <input
          type="text"
          value={etat}
          onChange={(e) => setEtat(e.target.value)}
          placeholder="État actuel (cordiale, rompue, sous tension…) — facultatif"
          className={cls}
        />
        <select
          className={cls}
          value={apparitionRelation}
          onChange={(e) => setApparitionRelation(e.target.value)}
          aria-label="Première apparition de la relation"
        >
          <option value="">Dès le début</option>
          {chapitres.map((c) => (
            <option key={c.id} value={c.id}>
              Révélée au chapitre {c.position} — {c.titre.slice(0, 30)}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={enCours || !origineId || !destinationId || !libelle.trim()}
          onClick={ajouterRelation}
          className="bouton-principal min-h-10 text-sm w-full disabled:opacity-40"
        >
          Relier
        </button>
        {relations.length > 0 && (
          <details className="text-xs text-encre-500">
            <summary className="cursor-pointer">Retirer une relation existante…</summary>
            <ul className="mt-2 space-y-1">
              {relations.map((a) => (
                <li key={a.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">
                    {a.libelle} — {TYPES_RELATION[a.type].libelle}
                  </span>
                  <button
                    type="button"
                    disabled={enCours}
                    className="text-grenat-400 hover:underline"
                    onClick={() => supprimer('relation', a.id)}
                  >
                    Retirer
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="velours p-5 rounded-2xl space-y-3" aria-labelledby="titre-ajout-eve">
        <h2 id="titre-ajout-eve" className="sur-titre text-encre-300">
          Consigner un événement
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <select
            className={cls}
            value={genreEve}
            onChange={(e) => setGenreEve(e.target.value as GenreEvenement)}
            aria-label="Genre d'événement"
          >
            {(Object.keys(GENRES_EVENEMENT) as GenreEvenement[]).map((g) => (
              <option key={g} value={g}>
                {GENRES_EVENEMENT[g].libelle}
              </option>
            ))}
          </select>
          <select
            className={cls}
            value={chapitreEve}
            onChange={(e) => setChapitreEve(e.target.value)}
            aria-label="Chapitre de l'événement"
          >
            <option value="">Chapitre…</option>
            {chapitres.map((c) => (
              <option key={c.id} value={c.id}>
                Chapitre {c.position}
              </option>
            ))}
          </select>
        </div>
        <input
          type="text"
          value={titreEve}
          onChange={(e) => setTitreEve(e.target.value)}
          placeholder="Titre (Elwenn découvre le Registre…)…"
          className={cls}
        />
        <textarea
          value={texteEve}
          onChange={(e) => setTexteEve(e.target.value)}
          rows={2}
          placeholder="Ce qui se joue (facultatif)…"
          className={cls}
        />
        {personnages.length > 0 && (
          <fieldset className="space-y-1.5">
            <legend className="text-xs text-encre-500">Personnages concernés</legend>
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
              {personnages.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`text-[11px] px-2 py-1 rounded-full border min-h-7 ${
                    cites.includes(n.id)
                      ? 'border-grenat-500 text-encre-100 bg-grenat-500/10'
                      : 'border-nuit-700 text-encre-400'
                  }`}
                  aria-pressed={cites.includes(n.id)}
                  onClick={() => basculerCite(n.id)}
                >
                  {n.nom}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        <select
          className={cls}
          value={relationEve}
          onChange={(e) => setRelationEve(e.target.value)}
          aria-label="Relation concernée (facultatif)"
        >
          <option value="">Aucune relation liée</option>
          {relations.map((a) => (
            <option key={a.id} value={a.id}>
              {a.libelle} ({TYPES_RELATION[a.type].libelle})
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={enCours || !titreEve.trim() || !chapitreEve}
          onClick={ajouterEvenement}
          className="bouton-principal min-h-10 text-sm w-full disabled:opacity-40"
        >
          Consigner dans la chronologie
        </button>
      </section>
    </div>
  );
}
