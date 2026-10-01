'use client';

// ============================================================
// EspaceLivre.tsx — Espace de travail d'un livre.
// Colonne de gauche : chapitres (statut, actions).
// Colonne de droite : lecture (source/traduit), commandes de
// traduction (file d'attente, progression, annulation), export.
// ============================================================

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { creerClientNavigateur } from '@/lib/supabase/client';
import { paginer } from '@/lib/pagination';
import type {
  Chapitre,
  CodeLangue,
  Livre,
  StatutChapitre,
} from '@/lib/types';
import { LANGUES } from '@/lib/types';
import { useMoteurTraduction } from '@/lib/useMoteurTraduction';
import { useLecture } from '@/lib/useLecture';
import { CLEF_PROGRESSION } from '@/lib/progression';
import { chercherTermes } from '@/lib/recherche';
import Recherche from '@/components/Recherche';
import RegleLecture from '@/components/RegleLecture';
import {
  Download,
  FileDown,
  FileText,
  Printer,
  Save,
  Sparkles,
} from 'lucide-react';

const CODES = Object.keys(LANGUES) as CodeLangue[];

interface ChapitreLeger {
  id: string;
  position: number;
  titre: string;
  statut: StatutChapitre;
}

const ETIQUETTE_STATUT_CHAPITRE: Record<StatutChapitre, string> = {
  a_traduire: 'À traduire',
  en_traduction: 'En cours…',
  traduit: 'Traduit',
  erreur: 'À reprendre',
};

const POINT_STATUT: Record<StatutChapitre, string> = {
  a_traduire: 'bg-encre-500',
  en_traduction: 'bg-grenat-400 animate-pouls-doux',
  traduit: 'bg-emerald-400',
  erreur: 'bg-amber-400',
};

interface Compteurs {
  total: number;
  faits: number;
  erreurs: number;
}

export default function EspaceLivre({
  livreInitial,
  chapitresInitiaux,
  totalCaracteres,
}: {
  livreInitial: Livre;
  chapitresInitiaux: ChapitreLeger[];
  /** Nombre total de caractères du livre (estimation du temps de lecture). */
  totalCaracteres: number;
}) {
  const supabaseRef = useRef(creerClientNavigateur());
  const requeteRef = useRef<string | null>(null);

  const [livre, setLivre] = useState(livreInitial);
  const [chapitres, setChapitres] = useState(chapitresInitiaux);
  const [selection, setSelection] = useState<string | null>(
    chapitresInitiaux[0]?.id ?? null
  );
  const [chapitreComplet, setChapitreComplet] = useState<Chapitre | null>(null);
  const [lecture, setLecture] = useState<'source' | 'traduit'>('source');
  const [compteurs, setCompteurs] = useState<Compteurs | null>(null);
  const [exportEnCours, setExportEnCours] = useState(false);
  const [messageLangue, setMessageLangue] = useState<string | null>(null);

  const { actif, progression, lancer, annuler, reprendre } =
    useMoteurTraduction();

  // ---------- Progression de lecture + stats (100 % local) ----------
  const {
    tempsLecture,
    tempsEstime,
    etiquetteReprise,
    chapitreReprendre,
    enregistrer,
  } = useLecture({
    livreId: livre.id,
    chapitres,
    totalCaracteres,
  });

  // Élément du lecteur mesuré pour calculer le ratio de texte lu.
  const corpsLectureRef = useRef<HTMLDivElement | null>(null);

  /** Ratio (0 → 1) du texte du chapitre déjà lu, dérivé du défilement. */
  function ratioLecture(): number {
    const corps = corpsLectureRef.current;
    if (!corps) return 0;
    // Le corps du chapitre est très haut : on mesure quelle longueur de
    // texte est passée sous l'œil (le haut du corps remonte à l'écran).
    const haut = corps.getBoundingClientRect().top;
    const defilement = -haut; // px de texte déjà passés sous l'œil
    const longueur = corps.scrollHeight * 0.8 || 1; // borne défensive
    return Math.min(1, Math.max(0, defilement / longueur));
  }

  /** Persiste le point de lecture (débrayé : 1 s max entre écritures). */
  const derniersEnregistrets = useRef(0);
  useEffect(() => {
    if (!selection) return;
    const idChapitre = selection;
    function surDefilement() {
      const maintenant = Date.now();
      if (maintenant - derniersEnregistrets.current < 1000) return;
      derniersEnregistrets.current = maintenant;
      enregistrer(idChapitre, ratioLecture());
    }
    surDefilement();
    window.addEventListener('scroll', surDefilement, { passive: true });
    return () => window.removeEventListener('scroll', surDefilement);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, chapitreComplet?.id]);

  // Au retour sur un livre déjà ouvert : on réouvre et on positionne
  // la lecture là où l'utilisateur l'avait laissée.
  const repriseFait = useRef(false);
  useEffect(() => {
    if (repriseFait.current || !chapitreReprendre) return;
    repriseFait.current = true;
    setSelection(chapitreReprendre);
  }, [chapitreReprendre]);
  /** Ratio enregistré pour un chapitre donné (0 si inconnu). */
  function ratioLectureCible(chapitreId: string): number {
    try {
      const brut = window.localStorage.getItem(CLEF_PROGRESSION);
      if (!brut) return 0;
      const p = JSON.parse(brut) as {
        livreId?: string;
        chapitreId?: string;
        ratio?: number;
      };
      if (p.livreId !== livre.id || p.chapitreId !== chapitreId) return 0;
      return typeof p.ratio === 'number' ? Math.min(Math.max(p.ratio, 0), 1) : 0;
    } catch {
      return 0;
    }
  }

  // Repositionnement une fois le chapitre chargé et le texte posé.
  useEffect(() => {
    if (!chapitreComplet) return;
    const id = chapitreComplet.id;
    const timer = window.setTimeout(() => {
      const corps = corpsLectureRef.current;
      if (!corps) return;
      const ratio = ratioLectureCible(id);
      if (ratio <= 0.02) return;
      // Le point de reprise est à `ratio` de la longueur du texte : on
      // défile pour qu'il se trouve légèrement sous le haut de l'écran.
      const defilement = ratio * 0.8 * corps.scrollHeight;
      const hautAbsolu = corps.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({
        top: Math.max(0, hautAbsolu + defilement - window.innerHeight * 0.08),
        behavior: 'auto',
      });
    }, 150);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapitreComplet?.id]);

  // ---------- Chargement d'un chapitre complet (textes) ----------
  // Chargement piloté par la sélection ; l'état « en chargement » est
  // dérivé (aucun setState synchrone dans l'effet).
  const chargementChapitre =
    !!selection && (!chapitreComplet || chapitreComplet.id !== selection);

  useEffect(() => {
    if (!selection) return;
    const id = selection;
    requeteRef.current = id;
    let ignore = false;
    (async () => {
      const { data } = await supabaseRef.current
        .from('chapitres')
        .select('*')
        .eq('id', id)
        .single();
      if (ignore || requeteRef.current !== id) return;
      if (data) {
        const chapitre = data as Chapitre;
        setChapitreComplet(chapitre);
        // Le chapitre traduit s'affiche d'emblée dans sa traduction.
        if (chapitre.texte_traduit) setLecture('traduit');
      }
    })();
    return () => {
      ignore = true;
    };
  }, [selection]);

  // ---------- Compteurs de progression (ensemble du livre) ----------
  const rafraichirCompteurs = useCallback(async () => {
    if (chapitres.length === 0) return;
    const ids = chapitres.map((c) => c.id);
    const lignes = await paginer<{ statut: string }>((debut, fin) =>
      supabaseRef.current
        .from('segments')
        .select('statut')
        .in('chapitre_id', ids)
        .range(debut, fin)
    );
    setCompteurs({
      total: lignes.length,
      faits: lignes.filter((l) => l.statut === 'fait').length,
      erreurs: lignes.filter((l) => l.statut === 'erreur').length,
    });
  }, [chapitres]);

  useEffect(() => {
    rafraichirCompteurs();
  }, [rafraichirCompteurs, actif]);

  // ---------- Reprise automatique des segments orphelins « en_cours » ----------
  // Au chargement / changement de chapitre : un onglet fermé (ou un crash)
  // en pleine traduction laisse des segments bloqués en « en_cours » que la
  // file ne reprend jamais (elle ne lit que « en_attente »/« erreur »). Au-delà
  // de ~10 min on les remet en attente, et si le chapitre se prétendait
  // « traduit »/« en_traduction » avec ce trou, on le corrige.
  useEffect(() => {
    if (!selection || actif) return;
    const id = selection;
    let ignore = false;
    (async () => {
      const repris = await reprendre(supabaseRef.current, id);
      if (ignore || repris === 0) return;
      const { data } = await supabaseRef.current
        .from('chapitres')
        .select('*')
        .eq('id', id)
        .single();
      if (ignore || !data) return;
      const chap = data as Chapitre;
      if (chap.statut === 'traduit' || chap.statut === 'en_traduction') {
        await supabaseRef.current
          .from('chapitres')
          .update({ statut: 'a_traduire' })
          .eq('id', id);
        chap.statut = 'a_traduire';
      }
      const statut = chap.statut;
      setChapitres((cs) =>
        cs.map((c) => (c.id === id ? { ...c, statut } : c))
      );
      setChapitreComplet((courant) =>
        courant && courant.id === id ? { ...courant, statut } : courant
      );
      rafraichirCompteurs();
    })();
    return () => {
      ignore = true;
    };
  }, [selection, actif, reprendre, rafraichirCompteurs]);

  // ---------- Fin d'un chapitre côté moteur ----------
  const majChapitre = useCallback(
    (chapitre: Chapitre, texteTraduit: string, statut: StatutChapitre) => {
      setChapitres((cs) =>
        cs.map((c) => (c.id === chapitre.id ? { ...c, statut } : c))
      );
      setChapitreComplet((courant) =>
        courant && courant.id === chapitre.id
          ? { ...courant, texte_traduit: texteTraduit, statut }
          : courant
      );
      setLivre((l) => ({
        ...l,
        statut:
          statut === 'erreur' ? 'erreur' : statut === 'traduit' ? 'traduit' : l.statut,
      }));
      rafraichirCompteurs();
    },
    [rafraichirCompteurs]
  );

  // ---------- Lancement de traductions ----------
  const traduireSelection = useCallback(async () => {
    if (!selection) return;
    const chapitre = chapitres.find((c) => c.id === selection);
    if (!chapitre) return;
    setLecture('traduit'); // on verra le texte se construire
    const { data } = await supabaseRef.current
      .from('chapitres')
      .select('*')
      .eq('id', chapitre.id)
      .single();
    if (!data) return;
    await lancer(supabaseRef.current, [data as Chapitre], livre, majChapitre);
  }, [selection, chapitres, livre, lancer, majChapitre]);

  const toutTraduire = useCallback(async () => {
    const { data: tous } = await supabaseRef.current
      .from('chapitres')
      .select('*')
      .eq('livre_id', livre.id)
      .order('position', { ascending: true });
    const restants = ((tous ?? []) as Chapitre[]).filter(
      (c) => c.statut !== 'traduit'
    );
    if (restants.length === 0) return;
    setLecture('traduit');
    await lancer(supabaseRef.current, restants, livre, majChapitre);
    rafraichirCompteurs();
  }, [livre, lancer, majChapitre, rafraichirCompteurs]);

  // ---------- Export ----------
  function telecharger(contenu: string, nomFichier: string, type: string) {
    const blob = new Blob([contenu], { type: `${type};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomFichier;
    a.click();
    URL.revokeObjectURL(url);
  }

  function telechargerBlob(blob: Blob, nomFichier: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomFichier;
    a.click();
    URL.revokeObjectURL(url);
  }

  const exporterChapitre = useCallback(async () => {
    if (!chapitreComplet) return;
    const texte = chapitreComplet.texte_traduit ?? chapitreComplet.texte_source;
    const titre = chapitreComplet.titre.replace(/[^\wÀ-ÿ -]+/g, '').trim();
    telecharger(
      `# ${chapitreComplet.titre}\n\n${texte.trimEnd()}\n`,
      `${livre.titre} — ${titre}.md`,
      'text/markdown'
    );
  }, [chapitreComplet, livre.titre]);

  /** Récupère tous les chapitres du livre (texte traduit si dispo). */
  const chargerChapitresExport = useCallback(async () => {
    const { data: tous } = await supabaseRef.current
      .from('chapitres')
      .select('position, titre, texte_source, texte_traduit, statut')
      .eq('livre_id', livre.id)
      .order('position', { ascending: true });
    const chapitresBruts = (tous ?? []) as Array<{
      titre: string;
      texte_source: string;
      texte_traduit: string | null;
      statut: string;
    }>;
    return chapitresBruts.map((c) => ({
      titre: c.titre,
      texte:
        c.statut === 'traduit' && c.texte_traduit
          ? c.texte_traduit
          : c.texte_source,
    }));
  }, [livre.id]);

  /** Chapitres complets, tels que le moteur PDF fidèle les attend
   *  (`titre`, `texte_source`, `texte_traduit`) — l'alignement exact
   *  se fait sur `texte_source`, champ donc indispensable. */
  const chargerChapitresFideles = useCallback(
    async () => {
      const { data: tous } = await supabaseRef.current
        .from('chapitres')
        .select('position, titre, texte_source, texte_traduit')
        .eq('livre_id', livre.id)
        .order('position', { ascending: true });
      return (tous ?? []).map((c: {
        position: number;
        titre: string;
        texte_source: string;
        texte_traduit: string | null;
      }) => ({
        titre: c.titre,
        texte_source: c.texte_source,
        texte_traduit: c.texte_traduit,
      }));
    },
    [livre.id]
  );

  const exporterLivre = useCallback(async () => {
    setExportEnCours(true);
    try {
      const chapitres = await chargerChapitresExport();
      const contenu = chapitres
        .map((c) => `# ${c.titre}\n\n${c.texte.trimEnd()}\n`)
        .join('\n\n---\n\n');
      telecharger(
        contenu,
        `${livre.titre} — traduction.md`,
        'text/markdown'
      );
    } finally {
      setExportEnCours(false);
    }
  }, [livre.titre, chargerChapitresExport]);

  /** Export Word (.docx) mis en forme — conserve tout le reste. */
  const exporterLivreDocx = useCallback(async () => {
    setExportEnCours(true);
    try {
      const chapitres = await chargerChapitresExport();
      const { genererDocx } = await import('@/lib/export-docx');
      const blob = await genererDocx(livre.titre, chapitres);
      telechargerBlob(blob, `${livre.titre} — traduction.docx`);
    } catch (e) {
      setMessageLangue(
        `Export Word impossible : ${e instanceof Error ? e.message : 'erreur inconnue'}`
      );
    } finally {
      setExportEnCours(false);
    }
  }, [livre.titre, chargerChapitresExport]);

  /** Impression / « Enregistrer en PDF » du livre mis en forme. */
  const imprimerLivrePdf = useCallback(async () => {
    const chapitres = await chargerChapitresExport();
    const { imprimerLivre } = await import('@/lib/imprimer-pdf');
    imprimerLivre(livre.titre, chapitres);
  }, [livre.titre, chargerChapitresExport]);

  /**
   * Télécharge le livre TRADUIT en PDF — même gabarit que l'original
   * (dimensions + marges du fichier source s'il est un PDF), texte
   * justifié, lettrines. La génération tourne 100% dans le navigateur.
   */
  const [genPdf, setGenPdf] = useState<{ fait: number; total: number } | null>(
    null
  );
  const telechargerPdfTraduit = useCallback(async () => {
    if (livre.fichier_original && genPdf) return; // déjà en cours
    try {
      setGenPdf({ fait: 0, total: 1 });
      const { genererPdfTraduit } = await import('@/lib/pdf-traduit');
      // 1. Géométrie de l'original (PDF uniquement ; A4 sinon).
      const estPdf =
        (livre.nom_fichier ?? '').toLowerCase().endsWith('.pdf') &&
        !!livre.fichier_original;
      let geo;
      if (estPdf) {
        const { data } = await supabaseRef.current.storage
          .from('originaux')
          .download(livre.fichier_original!);
        if (data) {
          const { mesurerOriginalPdf } = await import('@/lib/pdf-navigateur');
          geo = await mesurerOriginalPdf(await data.arrayBuffer());
        }
      }
      if (geo) setGenPdf({ fait: 0, total: 2 });
      // 2. Chapitres traduits en ordre.
      const chapitres = await chargerChapitresExport();
      // 3. Génération (barre de progression par chapitre).
      const bytes = await genererPdfTraduit({
        titreLivre: livre.titre,
        auteur: livre.auteur,
        chapitres,
        geo: geo ?? undefined,
        onChapitre: (traites, total) =>
          setGenPdf({ fait: traites + 1, total }),
      });
      setGenPdf(null);
      const base = (livre.nom_fichier ?? livre.titre).replace(/\.pdf$/i, '');
      telechargerBlob(
        new Blob([bytes as BlobPart], { type: 'application/pdf' }),
        `${base} — traduit.pdf`
      );
    } catch (e) {
      setGenPdf(null);
      setMessageLangue(
        `PDF traduit impossible : ${e instanceof Error ? e.message : 'erreur inconnue'}`
      );
    }
  }, [livre, genPdf, chargerChapitresExport]);

  /** Télécharge le fichier ORIGINAL (mise en forme d'origine intacte). */
  const telechargerOriginal = useCallback(async () => {
    if (!livre.fichier_original) {
      setMessageLangue(
        "L'original n'a pas été conservé pour ce livre (import avant cette fonctionnalité)."
      );
      return;
    }
    try {
      const { data, error } = await supabaseRef.current.storage
        .from('originaux')
        .download(livre.fichier_original);
      if (error || !data) throw error ?? new Error('Téléchargement impossible.');
      telechargerBlob(data, livre.nom_fichier ?? 'original');
    } catch (e) {
      setMessageLangue(
        `Original indisponible : ${e instanceof Error ? e.message : 'erreur inconnue'}`
      );
    }
  }, [livre.fichier_original, livre.nom_fichier]);

  /** Export « PDF — mise en page d'origine, contenu français ».
   *  Le fichier original est conservé À L'IDENTIQUE (couleur de
   *  page, marges, polices, images, ornement) : seul le corps du
   *  texte est remplacé par le français, coulé dans les mêmes boîtes
   *  aux mêmes positions. Le moteur tourne 100 % dans le navigateur.
   *  Indisponible : sans fichier original, ou chapitre incomplet.
   *  100 % navigateur : fichier original du stockage, géométrie par
   *  analyse complète, recoulement du corps français, assemblage.
   *  Durée réelle : quelques dizaines de secondes pour un livre.
   */
  const [exportFidele, setExportFidele] = useState<{
    etape: number;
    total: number;
    libelle: string;
  } | null>(null);

  const telechargerFidele = useCallback(async () => {
    if (exportFidele || exportEnCours || genPdf) return;
    try {
      const incomplets = chapitres.filter((c) => c.statut !== 'traduit');
      if (incomplets.length > 0) {
        setMessageLangue(
          `Traduction incomplète : ${incomplets.length} chapitre(s) non traduit — impossible de garantir un contenu 100 % français.`
        );
        return;
      }
      setExportFidele({ etape: 1, total: 6, libelle: 'Démarrage…' });
      const { exporterPdfFidele } = await import('@/lib/export-fidele');
      // L'alignement exact a besoin des chapitres TELS QUE STOCKÉS
      // (texte_source = sous-texte exact du flux d'import ;
      // texte_traduit = le contenu français). On charge donc tous
      // les chapitres complets — le moteur gère de lui-même le cas
      // « chapitre non traduit » (la source y est coulée telle
      // quelle, sans mot perdu ni dupliqué).
      const tous = await chargerChapitresFideles();
      if (tous.length === 0) {
        throw new Error('Aucun chapitre trouvé dans la base.');
      }
      // Récupère l'original conservé en base (même chemin que le
      // bouton « Original ») — le moteur se charge du reste en local.
      const telechargerOriginalFidele = async (chemin: string) => {
        const { data, error } = await supabaseRef.current.storage
          .from('originaux')
          .download(chemin);
        if (error || !data) {
          throw error ?? new Error('Téléchargement de l’original impossible.');
        }
        return data.arrayBuffer();
      };
      await exporterPdfFidele(
        {
          id: livre.id,
          titre: livre.titre,
          langue_cible: livre.langue_cible,
          fichier_original: livre.fichier_original,
        },
        tous,
        telechargerOriginalFidele,
        (p: { etape: number; total: number; libelle?: string }) =>
          setExportFidele({
            etape: p.etape,
            total: p.total,
            libelle: p.libelle ?? '',
          })
      );
    } catch (e) {
      setMessageLangue(
        `PDF fidèle impossible : ${e instanceof Error ? e.message : 'erreur inconnue'}`
      );
    } finally {
      setExportFidele(null);
    }
  }, [livre, chapitres, exportFidele, exportEnCours, genPdf, chargerChapitresFideles]);

  // ---------- Langues du livre ----------
  async function changerLangues(source: string, cible: string) {
    if (source === cible) {
      setMessageLangue('La langue source et la langue cible doivent différer.');
      return;
    }
    setMessageLangue(null);
    const { error } = await supabaseRef.current
      .from('livres')
      .update({ langue_source: source, langue_cible: cible })
      .eq('id', livre.id);
    if (error) {
      setMessageLangue(`Erreur : ${error.message}`);
      return;
    }
    setLivre((l) => ({ ...l, langue_source: source, langue_cible: cible }));
    setMessageLangue(
      'Langues mises à jour pour les prochaines traductions. Les segments déjà traduits sont conservés.'
    );
  }

  // ---------- Divers ----------
  const texteAffiche = useMemo(() => {
    if (!chapitreComplet) return '';
    if (lecture === 'traduit')
      return chapitreComplet.texte_traduit ?? chapitreComplet.texte_source;
    return chapitreComplet.texte_source;
  }, [chapitreComplet, lecture]);

  const texteNet = useMemo(() => texteAffiche.trim(), [texteAffiche]);

  // ---------- Recherche plein texte (chapitre affiché) ----------
  const [term, setTerm] = useState('');
  const [indexActif, setIndexActif] = useState(0);
  const plaques = useMemo(
    () =>
      term.trim().length >= 2 && texteNet.length > 0
        ? chercherTermes(texteNet, term)
        : [],
    [texteNet, term]
  );
  // Clé de la source (chapitre + langue affichée) : le retour à zéro est
  // détecté au RENDU par comparaison avec la clé précédente (état
  // « à réinitialiser »), pattern toléré par les règles React Compiler —
  // aucun setState synchrone dans un effet.
  const cleRecherche = `${texteNet.length}:${term}`;
  const [clePrec, setClePrec] = useState(cleRecherche);
  const [reinit, setReinit] = useState(false);
  if (reinit) {
    setIndexActif(0);
    setReinit(false);
  } else if (cleRecherche !== clePrec) {
    setClePrec(cleRecherche);
    setReinit(true);
  }
  // Garde-fou défensif : si les plaques ont rétréci, on borne l'index.
  const indexAffiche =
    plaques.length > 0 ? Math.min(indexActif, plaques.length - 1) : 0;
  // La plaque active est ramenée à l'écran (marque spéciale montée
  // dans le corps du chapitre).
  useEffect(() => {
    if (plaques.length === 0) return;
    const marque = document.querySelector('[data-ligne-recherche-active]');
    marque?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [indexAffiche, plaques.length]);

  /** Rendu du texte avec surlignage des occurrences recherchées ;
   * la plaque active porte un marqueur pour le défilement. */
  const surligne = (texte: string) => {
    if (plaques.length === 0) return texte;
    const morceaux: ReactNode[] = [];
    let curseur = 0;
    plaques.forEach((p, i) => {
      if (p.debut < curseur) return; // anomalie défensive
      if (p.debut > curseur) morceaux.push(texte.slice(curseur, p.debut));
      const contenu = texte.slice(p.debut, p.fin);
      morceaux.push(
        i === indexAffiche ? (
          <mark
            key={`actif-${i}`}
            data-ligne-recherche-active=""
          >
            {contenu}
          </mark>
        ) : (
          <mark key={`occ-${i}`}>{contenu}</mark>
        )
      );
      curseur = p.fin;
    });
    if (curseur < texte.length) morceaux.push(texte.slice(curseur));
    return morceaux;
  };

  const pourcentage =
    compteurs && compteurs.total > 0
      ? Math.round((compteurs.faits / compteurs.total) * 100)
      : 0;

  const chapitreActuel = chapitres.find((c) => c.id === selection) ?? null;

  return (
    <div className="flex flex-col lg:flex-row gap-5 min-h-[70vh]">
      {/* ======== Colonne gauche : chapitres ======== */}
      <aside className="w-full lg:w-80 shrink-0">
        <div className="velours p-4 flex flex-col h-full max-h-[75vh] lg:sticky lg:top-20">
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-xs uppercase tracking-[0.25em] text-encre-500">
              Chapitres
            </h2>
            <span className="text-[11px] text-encre-500">
              {chapitres.length}
            </span>
          </div>

          <nav className="space-y-1 overflow-y-auto pr-1 flex-1">
            {chapitres.map((chapitre) => (
              <button
                key={chapitre.id}
                type="button"
                onClick={() => setSelection(chapitre.id)}
                className={`w-full text-left rounded-xl px-3 py-2.5 flex items-center gap-2.5 transition-colors cursor-pointer border ${
                  selection === chapitre.id
                    ? 'bg-nuit-700/60 border-grenat-700 text-encre-100'
                    : 'border-transparent hover:bg-nuit-700/40 text-encre-300'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${POINT_STATUT[chapitre.statut]}`}
                  title={ETIQUETTE_STATUT_CHAPITRE[chapitre.statut]}
                />
                <span className="truncate text-sm">{chapitre.titre}</span>
              </button>
            ))}
          </nav>

          {/* Progression globale */}
          {compteurs && compteurs.total > 0 && (
            <div className="mt-4 pt-4 border-t border-nuit-700/60 px-1">
              <div className="flex justify-between text-[11px] text-encre-500 mb-1.5">
                <span>
                  {compteurs.faits} / {compteurs.total} segments
                </span>
                <span>{pourcentage} %</span>
              </div>
              <div className="h-1.5 rounded-full bg-nuit-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-grenat-500 to-violet-rom-500 transition-all duration-500"
                  style={{ width: `${pourcentage}%` }}
                />
              </div>
              {compteurs.erreurs > 0 && (
                <p className="text-[11px] text-amber-300 mt-1.5">
                  ⚠ {compteurs.erreurs} segment(s) en erreur — relance une
                  traduction pour réessayer.
                </p>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* ======== Colonne droite : lecture & actions ======== */}
      <section className="flex-1 min-w-0 flex flex-col gap-4">
        {/* Bandeau d'actions */}
        <div className="velours p-4 flex flex-wrap items-center gap-3">
          <div className="min-w-0 mr-auto">
            <Link
              href="/bibliotheque"
              className="text-[11px] text-encre-500 hover:text-grenat-300 transition-colors"
            >
              ← Bibliothèque
            </Link>
            <h1 className="font-display text-xl text-encre-100 truncate leading-snug">
              {livre.titre}
            </h1>
            <p className="text-[11px] text-encre-500">
              {LANGUES[livre.langue_source as CodeLangue]} →{' '}
              {LANGUES[livre.langue_cible as CodeLangue]}
              {tempsEstime && (
                <span title="Temps estimé de lecture du livre entier">
                  {' '}
                  · ⏱ ~{tempsEstime}
                </span>
              )}
              {tempsLecture && (
                <span title="Temps que vous y avez consacré">
                  {' '}
                  · lu : {tempsLecture}
                </span>
              )}
            </p>
          </div>

          <select
            className="select-sombre text-xs"
            value={livre.langue_source}
            onChange={(e) =>
              changerLangues(e.target.value, livre.langue_cible)
            }
            title="Langue source"
          >
            {CODES.map((c) => (
              <option key={c} value={c}>
                {LANGUES[c]}
              </option>
            ))}
          </select>
          <span className="text-encre-500 text-xs">→</span>
          <select
            className="select-sombre text-xs"
            value={livre.langue_cible}
            onChange={(e) =>
              changerLangues(livre.langue_source, e.target.value)
            }
            title="Langue cible"
          >
            {CODES.map((c) => (
              <option key={c} value={c}>
                {LANGUES[c]}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={exporterChapitre}
            disabled={!chapitreComplet || exportEnCours}
            className="bouton-fantome inline-flex items-center gap-1.5 !px-2.5 !py-1.5 text-xs"
            title="Exporter le chapitre courant (.md)"
          >
            <FileDown size={14} aria-hidden />
            <span>Chapitre</span>
          </button>
          <button
            type="button"
            onClick={exporterLivre}
            disabled={exportEnCours}
            className="bouton-fantome inline-flex items-center gap-1.5 !px-2.5 !py-1.5 text-xs"
            title="Exporter le livre entier (.md)"
          >
            <FileText size={14} aria-hidden />
            <span>Livre (.md)</span>
          </button>
          <button
            type="button"
            onClick={exporterLivreDocx}
            disabled={exportEnCours}
            className="bouton-fantome inline-flex items-center gap-1.5 !px-2.5 !py-1.5 text-xs"
            title="Télécharger le livre mis en forme (Word)"
          >
            <Save size={14} aria-hidden />
            <span>Word (.docx)</span>
          </button>
          <button
            type="button"
            onClick={imprimerLivrePdf}
            disabled={exportEnCours}
            className="bouton-fantome inline-flex items-center gap-1.5 !px-2.5 !py-1.5 text-xs"
            title="Mise en page puis « Enregistrer en PDF »"
          >
            <Printer size={14} aria-hidden />
            <span>Imprimer en PDF</span>
          </button>
          <button
            type="button"
            onClick={telechargerPdfTraduit}
            disabled={!!genPdf || exportEnCours}
            className="bouton-fantome inline-flex items-center gap-1.5 !px-2.5 !py-1.5 text-xs"
            title="Télécharger le livre TRADUIT, re-paginé, même gabarit que l'original"
          >
            <Download size={14} aria-hidden />
            <span>
              {genPdf
                ? `PDF re-paginé… ${genPdf.fait}/${genPdf.total === 2 ? '…' : genPdf.total}`
                : 'PDF traduit (re-paginé)'}
            </span>
          </button>
          <button
            type="button"
            onClick={telechargerOriginal}
            disabled={exportEnCours}
            className="bouton-fantome inline-flex items-center gap-1.5 !px-2.5 !py-1.5 text-xs"
            title="Télécharger le fichier original, inchangé"
          >
            <Download size={14} aria-hidden />
            <span>Original</span>
          </button>
          {livre.fichier_original &&
            ((livre.nom_fichier ?? '').toLowerCase().endsWith('.pdf') ? (
              <button
                type="button"
                onClick={telechargerFidele}
                disabled={!!exportFidele || exportEnCours || !!genPdf}
                className="bouton-fidele mt-2 flex w-full items-center justify-center gap-2.5 !px-4 !py-2.5 text-sm"
                title="Même PDF que l'original (couleur de page, marges, polices, images, ornement) avec le corps en français"
              >
                <Sparkles size={17} aria-hidden />
                <span
                  className={exportFidele ? 'flex items-center gap-2 flex-col text-left' : ''}
                >
                  {exportFidele ? (
                    <>
                      <span>
                        {exportFidele.libelle} ({exportFidele.etape}/{exportFidele.total})…
                      </span>
                      <span className="progression-export w-4/5 h-1 bg-white/15 overflow-hidden rounded-full">
                        <span
                          className="block h-full bg-grenat-400 transition-all"
                          style={{
                            width: `${Math.round(
                              ((exportFidele.etape - 1) / exportFidele.total) * 100
                            )}%`,
                          }}
                        />
                      </span>
                    </>
                  ) : (
                    <span>PDF — mise en page d’origine, contenu FR</span>
                  )}
                </span>
              </button>
            ) : (
              // Original .txt / .md / .epub : il n’y a pas de mise en
              // page d’origine à conserver (pas de PDF source). On
              // n’affiche plus un bouton qui échouait binairement
              // (« No PDF header found ») — on oriente vers les deux
              // alternatives qui produisent bien un PDF lisible.
              <p className="mt-2 text-[11px] text-encre-500 bg-nuit-800/40 border border-nuit-700/40 rounded-xl px-3 py-2">
                ✦ Original <code className="text-grenat-300">{(livre.nom_fichier ?? 'texte').match(/\.[a-z0-9]+$/i)?.[0] ?? ''}</code> —
                la mise en page d’origine n’existe pas. PDF à vous :
                « PDF traduit (re-paginé) » ou « Imprimer en PDF ».
              </p>
            ))}
        </div>

        {/* Message langue / info */}
        {etiquetteReprise && (
          <p className="text-[11px] text-encre-500 -mt-2 px-1">
            ✦ Où vous êtes : {etiquetteReprise}
          </p>
        )}

        {messageLangue && (
          <p className="text-xs text-grenat-300 bg-grenat-700/15 border border-grenat-700/40 rounded-xl px-4 py-2">
            {messageLangue}
          </p>
        )}

        {/* Progression de la traduction en cours */}
        {actif && (
          <div className="velours p-4 animate-fondu-monte border-grenat-700">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-52">
                <p className="text-sm text-encre-100 mb-1.5">
                  {progression.chapitreEnCours
                    ? `Traduction de « ${progression.chapitreEnCours.titre} »…`
                    : 'Préparation…'}
                </p>
                <div className="h-2 rounded-full bg-nuit-700 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-grenat-400 via-grenat-500 to-violet-rom-500 transition-all duration-300"
                    style={{
                      width: `${
                        progression.total > 0
                          ? Math.round(
                              ((progression.faits + progression.erreurs) /
                                progression.total) *
                                100
                            )
                          : 4
                      }%`,
                    }}
                  />
                </div>
                <p className="text-[11px] text-encre-500 mt-1.5">
                  {progression.faits + progression.erreurs} /{' '}
                  {progression.total} segments traités
                  {progression.erreurs > 0 &&
                    ` · ${progression.erreurs} en erreur`}
                </p>
              </div>
              <button
                type="button"
                onClick={annuler}
                className="bouton-fantome !border-amber-500/50 text-amber-300 text-xs"
              >
                ■ Annuler
              </button>
            </div>
          </div>
        )}

        {/* Commandes de traduction */}
        {!actif && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={traduireSelection}
              disabled={
                !chapitreActuel || chapitreActuel.statut === 'traduit'
              }
              className="bouton-principal text-sm"
              title={
                chapitreActuel?.statut === 'traduit'
                  ? 'Chapitre déjà traduit'
                  : 'Traduire le chapitre sélectionné'
              }
            >
              {chapitreActuel?.statut === 'a_traduire'
                ? 'Traduire ce chapitre'
                : chapitreActuel?.statut === 'erreur'
                  ? 'Reprendre ce chapitre'
                  : 'Traduire ce chapitre'}
            </button>
            <button
              type="button"
              onClick={toutTraduire}
              disabled={compteurs !== null && compteurs.total === compteurs.faits}
              className="bouton-fantome text-sm"
            >
              Tout traduire
            </button>
            {chapitreActuel && (
              <span
                className={`text-[11px] uppercase tracking-wider rounded-full px-2.5 py-1 ${
                  chapitreActuel.statut === 'traduit'
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : chapitreActuel.statut === 'en_traduction'
                      ? 'bg-grenat-500/15 text-grenat-300'
                      : chapitreActuel.statut === 'erreur'
                        ? 'bg-amber-500/15 text-amber-300'
                        : 'bg-encre-500/15 text-encre-300'
                }`}
              >
                {ETIQUETTE_STATUT_CHAPITRE[chapitreActuel.statut]}
              </span>
            )}
          </div>
        )}

        {/* Bascule source / traduction */}
        {chapitreComplet?.texte_traduit && (
          <div className="flex rounded-full bg-nuit-800 p-1 w-fit border border-nuit-700">
            <button
              type="button"
              onClick={() => setLecture('source')}
              className={`px-4 py-1.5 text-xs rounded-full transition-all cursor-pointer ${
                lecture === 'source'
                  ? 'bg-nuit-700 text-encre-100'
                  : 'text-encre-500 hover:text-encre-300'
              }`}
            >
              {LANGUES[livre.langue_source as CodeLangue]}
            </button>
            <button
              type="button"
              onClick={() => setLecture('traduit')}
              className={`px-4 py-1.5 text-xs rounded-full transition-all cursor-pointer ${
                lecture === 'traduit'
                  ? 'bg-nuit-700 text-encre-100'
                  : 'text-encre-500 hover:text-encre-300'
              }`}
            >
              {LANGUES[livre.langue_cible as CodeLangue]}
            </button>
          </div>
        )}

        {/* Lecteur — façon livre : surface calme, colonne ~65 caractères */}
        <div
          id="lecteur-chapitre"
          className="lecture velours lecture-transparente p-6 sm:p-12 flex-1 min-h-[40vh]"
        >
          {chargementChapitre ? (
            <p className="text-encre-500 text-sm animate-pouls-doux text-center">
              Ouverture du chapitre…
            </p>
          ) : !chapitreComplet ? (
            <p className="text-encre-500 text-sm italic text-center">
              Choisissez un chapitre dans la liste.
            </p>
          ) : (
            <article className="animate-fondu-monte colonne-lecture">
              <header className="text-center mb-10">
                <p className="sur-titre text-grenat-400/80 mb-2">
                  ✦ chapitre ✦
                </p>
                <h2 className="font-display text-2xl sm:text-4xl text-encre-100 leading-snug">
                  {chapitreComplet.titre}
                </h2>
                <div className="liseret mx-auto mt-5" />
              </header>

              {/* Barre outils du chapitre : recherche + réglages confort */}
              <div className="flex items-center gap-2 mb-8 -mx-1 px-1">
                <Recherche
                  term={term}
                  texte={texteNet}
                  plaques={plaques}
                  indexActif={indexAffiche}
                  onTerm={setTerm}
                  onIndexActif={setIndexActif}
                />
                <RegleLecture idLecteur="lecteur-chapitre" />
              </div>

              {texteAffiche.trim().length === 0 ? (
                <p className="text-encre-500 italic text-center text-sm">
                  Ce chapitre est vide.
                </p>
              ) : (
                <div
                  id="corps-livre"
                  ref={corpsLectureRef}
                  className="corps-livre whitespace-pre-wrap text-inherit/95 first-letter:float-left first-letter:font-display first-letter:text-6xl first-letter:leading-[0.8] first-letter:pr-3 first-letter:text-grenat-400"
                >
                  {surligne(texteNet)}
                </div>
              )}
            </article>
          )}
        </div>
      </section>
    </div>
  );
}
