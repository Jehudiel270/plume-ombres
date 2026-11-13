'use client';

// ============================================================
// BarreNavigation.tsx — Navigation de l'espace connecté.
//
// Plan du site complet (accueil, bibliothèque, favoris, pages
// publiques), menu utilisateur (compte, apparence, cadre légal,
// déconnexion) et menu mobile.
//
// Accessibilité : état actif exposé par aria-current, navigation
// clavier (Tab, Origine/Fin, flèches, Échap) et fermeture au clic
// extérieur. Aucune couleur en dur : tout passe par les jetons du
// design system (--color-*, .bouton-*, .lien-discret, .velours…).
//
// Le bouton « Apparence » ne monte aucun panneau : il publie
// l'événement `plume:ouvrir-apparence`, écouté ailleurs.
// ============================================================

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { ChevronDown, BookMarked, CreditCard, Image as ImageIcon, Lightbulb, LogOut, Menu, NotebookPen, Orbit, Palette, Sparkles, TrendingUp, User } from 'lucide-react';
import { creerClientNavigateur } from '@/lib/supabase/client';
import ClocheNotifications from '@/components/ClocheNotifications';
import {
  liensNavigationSupplementaires,
  normaliserRole,
  type Role,
} from '@/lib/roles';

interface Props {
  email: string;
  pseudo: string;
  /**
   * Rôle connu du serveur. Optionnel : quand il n'est pas fourni, la
   * barre lit son propre profil (RLS « own ») pour afficher ou non
   * l'entrée d'administration. Les pages existantes n'ont pas à changer.
   */
  role?: Role | string;
}

interface Lien {
  href: string;
  libelle: string;
}

/** Entrée « Atelier » : lien renvoyé par /api/atelier/liens
 *  (modules ouverts pour le compte, évalués côté serveur). */
interface LienAtelier {
  href: string;
  libelle: string;
  detail: string;
}

const ICONES_ATELIER: Record<string, ReactNode> = {
  '/carnet': <NotebookPen size={15} />,
  '/theories': <Lightbulb size={15} />,
  '/progression': <TrendingUp size={15} />,
  '/ambiance': <Sparkles size={15} />,
  '/glossaire': <BookMarked size={15} />,
  '/univers': <Orbit size={15} />,
  '/cartes': <ImageIcon size={15} />,
};

/** Plan du site principal (desktop et menu mobile). */
const LIENS_SITE: Lien[] = [
  { href: '/', libelle: 'Accueil' },
  { href: '/bibliotheque', libelle: 'Bibliothèque' },
  { href: '/favoris', libelle: 'Favoris' },
  { href: '/annonces', libelle: 'Nouveautés' },
  { href: '/tarifs', libelle: 'Tarifs' },
  { href: '/faq', libelle: 'FAQ' },
  { href: '/contact', libelle: 'Contact' },
];

/** Cadre légal — regroupé pour ne pas encombrer la barre. */
const LIENS_LEGAUX: Lien[] = [
  { href: '/conditions', libelle: 'Conditions générales' },
  { href: '/confidentialite', libelle: 'Confidentialité' },
  { href: '/mentions-legales', libelle: 'Mentions légales' },
];

/**
 * Une entrée est active si le chemin courant lui appartient.
 * La bibliothèque reste active sur les fiches livre (/livres/[id]);
 * l'accueil ne l'est que sur « / » exactement.
 */
function estActif(chemin: string, href: string): boolean {
  if (href === '/') return chemin === '/';
  if (href === '/bibliotheque') {
    return chemin === '/bibliotheque' || chemin.startsWith('/livres');
  }
  return chemin === href || chemin.startsWith(`${href}/`);
}

/** Classes communes d'un lien de la barre (avec état actif). */
function classesLien(actif: boolean): string {
  return `relative rounded-full px-3 py-2 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-grenat-400 focus-visible:ring-offset-2 focus-visible:ring-offset-nuit-950 ${
    actif
      ? 'text-grenat-300 bg-grenat-500/10 font-medium'
      : 'text-encre-300 hover:text-encre-100 hover:bg-white/[0.05]'
  }`;
}

// ------------------------------------------------------------
// Hook : état et comportements d'un menu déroulant accessible.
// Gère l'ouverture, le focus initial, les flèches, Échap, le clic
// extérieur et le retour du focus au déclencheur. Les éléments
// interactifs du panneau portent role="menuitem".
// ------------------------------------------------------------
type FocusInitial = 'premier' | 'dernier' | null;

function useMenuAccessible() {
  const [ouvert, setOuvert] = useState(false);
  const zoneRef = useRef<HTMLDivElement>(null);
  const declencheurRef = useRef<HTMLButtonElement>(null);
  const panneauRef = useRef<HTMLDivElement>(null);
  const focusInitial = useRef<FocusInitial>(null);

  const fermer = useCallback((rendreFocus = false) => {
    setOuvert(false);
    if (rendreFocus) declencheurRef.current?.focus();
  }, []);

  const basculer = useCallback(() => setOuvert((o) => !o), []);

  // Focus du premier / dernier élément à l'ouverture au clavier.
  useEffect(() => {
    if (!ouvert || !focusInitial.current) return;
    const cible = focusInitial.current;
    focusInitial.current = null;
    const liste = Array.from(
      panneauRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []
    );
    if (!liste.length) return;
    (cible === 'dernier' ? liste[liste.length - 1] : liste[0]).focus();
  }, [ouvert]);

  // Fermeture au clic / toucher extérieur.
  useEffect(() => {
    if (!ouvert) return;
    const surClic = (e: PointerEvent) => {
      if (!zoneRef.current?.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener('pointerdown', surClic);
    return () => document.removeEventListener('pointerdown', surClic);
  }, [ouvert]);

  // Le déclencheur ouvre au clavier (flèches) et ferme sur Échap.
  // Si le menu est déjà ouvert, la flèche déplace le focus dedans.
  const focaliser = (position: 'premier' | 'dernier') => {
    const liste = Array.from(
      panneauRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []
    );
    if (!liste.length) return;
    (position === 'dernier' ? liste[liste.length - 1] : liste[0]).focus();
  };

  const surDeclencheur = (e: ReactKeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (ouvert) focaliser('premier');
      else {
        focusInitial.current = 'premier';
        setOuvert(true);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (ouvert) focaliser('dernier');
      else {
        focusInitial.current = 'dernier';
        setOuvert(true);
      }
    } else if (e.key === 'Escape') {
      setOuvert(false);
    }
  };

  // Déplacement circulaire dans le panneau.
  const surPanneau = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      fermer(true);
      return;
    }
    if (e.key === 'Tab') {
      setOuvert(false);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const liste = Array.from(
      panneauRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []
    );
    if (!liste.length) return;
    const index = liste.indexOf(document.activeElement as HTMLElement);
    e.preventDefault();
    if (e.key === 'Home') {
      liste[0].focus();
    } else if (e.key === 'End') {
      liste[liste.length - 1].focus();
    } else if (e.key === 'ArrowDown') {
      liste[(index + 1) % liste.length].focus();
    } else {
      // ArrowUp : depuis aucun élément focalisé, on part du dernier.
      liste[index <= 0 ? liste.length - 1 : index - 1].focus();
    }
  };

  return { ouvert, fermer, basculer, zoneRef, declencheurRef, panneauRef, surDeclencheur, surPanneau };
}

// ------------------------------------------------------------
// Panneau générique (sections + entrées role="menuitem").
// ------------------------------------------------------------
function Panneau({
  id,
  etiquette,
  align = 'droite',
  panneauRef,
  surPanneau,
  children,
  className = '',
}: {
  id: string;
  etiquette: string;
  align?: 'gauche' | 'droite';
  panneauRef: React.RefObject<HTMLDivElement | null>;
  surPanneau: (e: ReactKeyboardEvent) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      ref={panneauRef}
      id={id}
      role="menu"
      aria-label={etiquette}
      onKeyDown={surPanneau}
      className={`velours absolute top-full mt-2 z-40 p-2 text-left animate-fondu-monte ${
        align === 'droite' ? 'right-0' : 'left-0'
      } ${className}`}
    >
      {children}
    </div>
  );
}

/** Entrée de menu : lien (navigation) ou bouton (action). */
function EntreeMenu({
  libelle,
  href,
  onClick,
  actif,
  icone,
}: {
  libelle: string;
  href?: string;
  onClick?: () => void;
  actif?: boolean;
  icone?: ReactNode;
}) {
  const classes = `flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-left transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-grenat-400 ${
    actif
      ? 'text-grenat-300 bg-grenat-500/10'
      : 'text-encre-300 hover:text-encre-100 hover:bg-white/[0.05]'
  }`;
  const contenu = (
    <>
      {icone ? (
        <span aria-hidden="true" className="shrink-0 opacity-80">
          {icone}
        </span>
      ) : null}
      <span className="truncate">{libelle}</span>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        role="menuitem"
        tabIndex={-1}
        aria-current={actif ? 'page' : undefined}
        className={classes}
        onClick={onClick}
      >
        {contenu}
      </Link>
    );
  }
  return (
    <button type="button" role="menuitem" tabIndex={-1} className={classes} onClick={onClick}>
      {contenu}
    </button>
  );
}

/** Titre de section, non interactif à l'intérieur du menu. */
function TitreMenu({ children }: { children: ReactNode }) {
  return (
    <p
      role="presentation"
      className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-[0.22em] text-encre-500"
    >
      {children}
    </p>
  );
}

// ------------------------------------------------------------
// Barre de navigation.
// ------------------------------------------------------------
export default function BarreNavigation({
  email,
  pseudo,
  role: roleInitial,
}: Props) {
  const routeur = useRouter();
  const chemin = usePathname();
  const [role, setRole] = useState<Role>(normaliserRole(roleInitial));

  // Rôle lu une seule fois si le serveur ne l'a pas fourni : c'est un
  // CONFORT d'interface (le garde serveur reste la source de vérité).
  useEffect(() => {
    if (roleInitial) return;
    let actif = true;
    (async () => {
      try {
        const supabase = creerClientNavigateur();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || !actif) return;
        const { data } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();
        if (actif) setRole(normaliserRole((data as { role?: string } | null)?.role));
      } catch {
        /* silencieux : le lien admin n'est jamais bloquant */
      }
    })();
    return () => {
      actif = false;
    };
  }, [roleInitial]);

  // CUMUL : ces liens s'AJOUTENT au plan du site.
  const liensSupplementaires = liensNavigationSupplementaires(role);

  // Portes d'entrée GLOBALES des modules ouverts (correctif « pages
  // manquantes ») : une seule interrogation par session, silencieuse
  // en cas d'échec — la fiche du livre reste le point d'entrée de
  // secours. Le serveur est l'autorité : la route ne renvoie que les
  // modules ouverts pour CE compte.
  const [liensAtelier, setLiensAtelier] = useState<LienAtelier[]>([]);
  useEffect(() => {
    let actif = true;
    (async () => {
      try {
        const reponse = await fetch('/api/atelier/liens');
        if (!reponse.ok) return;
        const donnees = (await reponse.json().catch(() => null)) as {
          liens?: LienAtelier[];
        } | null;
        if (actif && Array.isArray(donnees?.liens)) setLiensAtelier(donnees.liens);
      } catch {
        /* silencieux : l'Atelier reste accessible depuis un livre */
      }
    })();
    return () => {
      actif = false;
    };
  }, []);

  const {
    ouvert: menuAtelierOuvert,
    fermer: fermerMenuAtelier,
    basculer: basculerMenuAtelier,
    zoneRef: zoneAtelierRef,
    declencheurRef: declencheurAtelierRef,
    panneauRef: panneauAtelierRef,
    surDeclencheur: surDeclencheurAtelier,
    surPanneau: surPanneauAtelier,
  } = useMenuAccessible();

  const [menuMobileOuvert, setMenuMobileOuvert] = useState(false);
  const {
    ouvert: menuUtilisateurOuvert,
    fermer: fermerMenuUtilisateur,
    basculer: basculerMenuUtilisateur,
    zoneRef,
    declencheurRef,
    panneauRef,
    surDeclencheur,
    surPanneau,
  } = useMenuAccessible();
  const headerRef = useRef<HTMLElement>(null);

  // Menu mobile : fermeture au clic / toucher hors de l'en-tête.
  useEffect(() => {
    if (!menuMobileOuvert) return;
    const surClic = (e: PointerEvent) => {
      if (!headerRef.current?.contains(e.target as Node)) setMenuMobileOuvert(false);
    };
    document.addEventListener('pointerdown', surClic);
    return () => document.removeEventListener('pointerdown', surClic);
  }, [menuMobileOuvert]);

  function fermerMenus() {
    setMenuMobileOuvert(false);
    fermerMenuUtilisateur(false);
    fermerMenuAtelier(false);
  }

  async function seDeconnecter() {
    fermerMenus();
    const supabase = creerClientNavigateur();
    await supabase.auth.signOut();
    routeur.push('/connexion');
    routeur.refresh();
  }

  function ouvrirApparence() {
    // Contrat d'interface : un panneau monté ailleurs écoute cet
    // événement. Aucun composant d'apparence n'est importé ici.
    window.dispatchEvent(new CustomEvent('plume:ouvrir-apparence'));
    fermerMenus();
  }

  function ouvrirMenuUtilisateur() {
    setMenuMobileOuvert(false);
    basculerMenuUtilisateur();
  }

  const initiale = pseudo.trim().slice(0, 1).toUpperCase() || 'L';
  const compteActif = estActif(chemin, '/compte');
  const abonnementActif = estActif(chemin, '/abonnement');

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-30 backdrop-blur-xl bg-nuit-950/75 border-b border-nuit-700/60"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
        {/* Marque */}
        <Link
          href="/bibliotheque"
          onClick={fermerMenus}
          className="flex items-center gap-2.5 group shrink-0"
          aria-label="Plume d’Ombres — ma bibliothèque"
        >
          <Image
            src="/logo.png"
            alt=""
            width={40}
            height={40}
            className="h-9 w-9 sm:h-10 sm:w-10 object-contain transition-transform duration-300 group-hover:scale-105"
          />
          <span className="font-display text-lg sm:text-xl text-encre-100">
            Plume <span className="texte-douche italic">d’Ombres</span>
          </span>
        </Link>

        {/* Plan du site — desktop */}
        <nav
          aria-label="Navigation principale"
          className="hidden lg:flex items-center gap-0.5 ml-2 flex-1 min-w-0"
        >
          {LIENS_SITE.map((l) => {
            const actif = estActif(chemin, l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={actif ? 'page' : undefined}
                className={classesLien(actif)}
              >
                {l.libelle}
              </Link>
            );
          })}

          {/* Atelier : les modules ouverts du compte (Carnet,
              Théories, Univers…). Caché tant que la route n'a rien
              renvoyé : aucun lien mort. */}
          {liensAtelier.length > 0 && (
            <div className="relative" ref={zoneAtelierRef}>
              <button
                ref={declencheurAtelierRef}
                type="button"
                onClick={basculerMenuAtelier}
                onKeyDown={surDeclencheurAtelier}
                aria-haspopup="menu"
                aria-expanded={menuAtelierOuvert}
                aria-controls="menu-atelier"
                className={`rounded-full px-3 py-2 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-grenat-400 cursor-pointer ${
                  menuAtelierOuvert
                    ? 'text-grenat-300 bg-grenat-500/10 font-medium'
                    : 'text-encre-300 hover:text-encre-100 hover:bg-white/[0.05]'
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  Atelier
                  <ChevronDown
                    aria-hidden="true"
                    size={14}
                    className={`transition-transform ${menuAtelierOuvert ? 'rotate-180' : ''}`}
                  />
                </span>
              </button>
              {menuAtelierOuvert && (
                <Panneau
                  id="menu-atelier"
                  etiquette="Atelier de lecture"
                  panneauRef={panneauAtelierRef}
                  surPanneau={surPanneauAtelier}
                  className="w-[min(21rem,calc(100vw-2rem))]"
                >
                  {liensAtelier.map((l) => (
                    <EntreeMenu
                      key={l.href}
                      href={l.href}
                      libelle={l.libelle}
                      actif={estActif(chemin, l.href)}
                      icone={ICONES_ATELIER[l.href]}
                      onClick={() => fermerMenuAtelier(false)}
                    />
                  ))}
                </Panneau>
              )}
            </div>
          )}
        </nav>

        <div className="flex items-center gap-2 ml-auto lg:ml-0">
          {/* Notifications — desktop, à côté de l'avatar */}
          <span className="hidden lg:block">
            <ClocheNotifications />
          </span>

          {/* Menu utilisateur */}
          <div className="relative" ref={zoneRef}>
            <button
              ref={declencheurRef}
              id="menu-utilisateur-declencheur"
              type="button"
              onClick={ouvrirMenuUtilisateur}
              onKeyDown={surDeclencheur}
              aria-haspopup="menu"
              aria-expanded={menuUtilisateurOuvert}
              aria-controls="menu-utilisateur"
              className="flex items-center gap-2.5 rounded-full pl-1 pr-1 lg:pr-3 py-1 border border-transparent hover:border-nuit-700 hover:bg-white/[0.04] transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-grenat-400"
              title="Mon compte et préférences"
            >
              <span
                aria-hidden="true"
                className="w-9 h-9 rounded-full grid place-items-center text-sm font-display italic bg-gradient-to-br from-grenat-600 to-violet-rom-600 text-white shadow shrink-0"
              >
                {initiale}
              </span>
              <span className="hidden md:block text-right leading-tight">
                <span className="block text-sm text-encre-100 max-w-[9rem] truncate">
                  {pseudo}
                </span>
                <span className="block text-[11px] text-encre-500 max-w-[9rem] truncate">
                  {email}
                </span>
              </span>
              <ChevronDown
                aria-hidden="true"
                size={15}
                className={`hidden md:block text-encre-500 transition-transform ${
                  menuUtilisateurOuvert ? 'rotate-180' : ''
                }`}
              />
              <span className="sr-only">
                {menuUtilisateurOuvert ? 'Fermer' : 'Ouvrir'} le menu de {pseudo}
              </span>
            </button>

            {menuUtilisateurOuvert && (
              <Panneau
                id="menu-utilisateur"
                etiquette={`Menu de ${pseudo}`}
                panneauRef={panneauRef}
                surPanneau={surPanneau}
                className="w-[min(19rem,calc(100vw-2rem))]"
              >
                <div role="presentation" className="px-3 py-2 md:hidden">
                  <p className="text-sm text-encre-100 truncate">{pseudo}</p>
                  <p className="text-[11px] text-encre-500 truncate">{email}</p>
                </div>
                <div role="presentation" className="md:hidden mx-2 my-1 h-px bg-nuit-700" />

                <EntreeMenu
                  href="/compte"
                  libelle="Mon compte"
                  actif={compteActif}
                  icone={<User size={15} />}
                  onClick={() => fermerMenuUtilisateur(false)}
                />
                <EntreeMenu
                  href="/abonnement"
                  libelle="Mon abonnement"
                  actif={abonnementActif}
                  icone={<CreditCard size={15} />}
                  onClick={() => fermerMenuUtilisateur(false)}
                />
                <EntreeMenu
                  libelle="Apparence"
                  icone={<Palette size={15} />}
                  onClick={ouvrirApparence}
                />

                <div role="separator" className="my-1.5 mx-2 h-px bg-nuit-700" />
                <TitreMenu>Cadre légal</TitreMenu>
                {LIENS_LEGAUX.map((l) => (
                  <EntreeMenu
                    key={l.href}
                    href={l.href}
                    libelle={l.libelle}
                    actif={estActif(chemin, l.href)}
                    onClick={() => fermerMenuUtilisateur(false)}
                  />
                ))}

                {liensSupplementaires.map((l) => (
                  <EntreeMenu
                    key={l.href}
                    href={l.href}
                    libelle={l.libelle}
                    actif={estActif(chemin, l.href)}
                    onClick={() => fermerMenuUtilisateur(false)}
                  />
                ))}

                <div role="separator" className="my-1.5 mx-2 h-px bg-nuit-700" />
                <EntreeMenu libelle="Quitter" icone={<LogOut size={15} />} onClick={seDeconnecter} />
              </Panneau>
            )}
          </div>

          {/* Déclencheur mobile. Enveloppé : .bouton-fantome est hors
              couche et écraserait `lg:hidden` (display) sur le bouton. */}
          <span className="lg:hidden">
            <button
              type="button"
              className="bouton-fantome !px-3 !py-2"
              aria-expanded={menuMobileOuvert}
              aria-controls="menu-mobile"
              aria-label={menuMobileOuvert ? 'Fermer le menu' : 'Ouvrir le menu'}
              onClick={() => {
                fermerMenuUtilisateur(false);
                setMenuMobileOuvert((o) => !o);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setMenuMobileOuvert(false);
              }}
            >
              <Menu size={18} aria-hidden="true" />
            </button>
          </span>
        </div>
      </div>

      {/* Plan du site — mobile */}
      {menuMobileOuvert && (
        <nav
          id="menu-mobile"
          aria-label="Navigation principale (mobile)"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setMenuMobileOuvert(false);
          }}
          className="lg:hidden border-t border-nuit-700/60 bg-nuit-950/95 px-4 py-3 flex flex-col gap-0.5 animate-fondu-monte max-h-[calc(100vh-4rem)] overflow-y-auto"
        >
          <ClocheNotifications avecLibelle />
          <div className="h-px bg-nuit-700 my-2" aria-hidden="true" />
          {LIENS_SITE.map((l) => {
            const actif = estActif(chemin, l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={actif ? 'page' : undefined}
                onClick={() => setMenuMobileOuvert(false)}
                className={`rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  actif
                    ? 'text-grenat-300 bg-grenat-500/10 font-medium'
                    : 'text-encre-300 hover:text-encre-100 hover:bg-white/[0.05]'
                }`}
              >
                {l.libelle}
              </Link>
            );
          })}

          {/* Atelier — modules ouverts du compte (mobile). */}
          {liensAtelier.length > 0 && (
            <>
              <div className="h-px bg-nuit-700 my-2" aria-hidden="true" />
              <p className="sur-titre text-encre-500 px-3 pb-1">Atelier</p>
              {liensAtelier.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={estActif(chemin, l.href) ? 'page' : undefined}
                  onClick={() => setMenuMobileOuvert(false)}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                    estActif(chemin, l.href)
                      ? 'text-grenat-300 bg-grenat-500/10 font-medium'
                      : 'text-encre-300 hover:text-encre-100 hover:bg-white/[0.05]'
                  }`}
                >
                  <span aria-hidden="true" className="opacity-80 shrink-0">
                    {ICONES_ATELIER[l.href]}
                  </span>
                  {l.libelle}
                </Link>
              ))}
            </>
          )}

          <div className="h-px bg-nuit-700 my-2" aria-hidden="true" />
          <p className="sur-titre text-encre-500 px-3 pb-1">Cadre légal</p>
          {LIENS_LEGAUX.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={estActif(chemin, l.href) ? 'page' : undefined}
              onClick={() => setMenuMobileOuvert(false)}
              className="lien-discret rounded-lg px-3 py-2.5 text-sm hover:bg-white/[0.05]"
            >
              {l.libelle}
            </Link>
          ))}

          <div className="h-px bg-nuit-700 my-2" aria-hidden="true" />
          <Link
            href="/compte"
            onClick={() => setMenuMobileOuvert(false)}
            aria-current={compteActif ? 'page' : undefined}
            className={`rounded-lg px-3 py-2.5 text-sm transition-colors ${
              compteActif
                ? 'text-grenat-300 bg-grenat-500/10 font-medium'
                : 'text-encre-300 hover:text-encre-100 hover:bg-white/[0.05]'
            }`}
          >
            Mon compte
          </Link>
          <Link
            href="/abonnement"
            onClick={() => setMenuMobileOuvert(false)}
            aria-current={abonnementActif ? 'page' : undefined}
            className={`rounded-lg px-3 py-2.5 text-sm transition-colors ${
              abonnementActif
                ? 'text-grenat-300 bg-grenat-500/10 font-medium'
                : 'text-encre-300 hover:text-encre-100 hover:bg-white/[0.05]'
            }`}
          >
            Mon abonnement
          </Link>
          <button
            type="button"
            onClick={ouvrirApparence}
            className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-left text-encre-300 hover:text-encre-100 hover:bg-white/[0.05] transition-colors cursor-pointer"
          >
            <Palette size={15} aria-hidden="true" className="opacity-80" />
            Apparence
          </button>
          <button
            type="button"
            onClick={seDeconnecter}
            className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-left text-grenat-300 hover:text-grenat-400 hover:bg-white/[0.05] transition-colors cursor-pointer"
          >
            <LogOut size={15} aria-hidden="true" className="opacity-80" />
            Quitter
          </button>
        </nav>
      )}
    </header>
  );
}
