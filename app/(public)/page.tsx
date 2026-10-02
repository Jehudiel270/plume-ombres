// ============================================================
// Landing page publique (/) — tâche C4.
//
// Présente AVANT toute inscription : le concept, les formats
// acceptés, la promesse et le prix. Remplace l'ancienne redirection
// automatique vers /bibliotheque ou /connexion.
//
// Honnêteté produit : rien n'est promis qui n'existe pas. Le paiement
// affiche « bientôt disponible » ; la section « Ce que le studio ne
// fait pas encore » liste les manques assumés.
// ============================================================

import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { utilisateurConnecte } from '@/lib/supabase/server';
import SectionPublique from '@/components/public/SectionPublique';

export const metadata: Metadata = {
  // `absolute` : le titre contient déjà la marque, on évite le doublon
  // avec le gabarit `%s · Plume d’Ombres` du layout racine.
  title: {
    absolute: 'Plume d’Ombres — traduire la dark romance, chapitre par chapitre',
  },
  description:
    'Importez une romance sombre (.txt, .md, .pdf texte, .epub), laissez-la se découper en chapitres, traduisez-la de l’anglais vers le français et lisez-la dans un lecteur confortable. Gratuit pendant le lancement.',
};

const FORMATS = [
  { ext: '.txt', note: 'Texte brut, le plus fiable' },
  { ext: '.md', note: 'Markdown, titres reconnus' },
  { ext: '.pdf', note: 'PDF avec texte sélectionnable' },
  { ext: '.epub', note: 'Chapitres et structure repris' },
];

const RITUEL = [
  {
    icone: '🕯️',
    titre: 'Importer',
    texte:
      'Déposez un seul fichier. Plume d’Ombres en extrait le texte et le calendrier de vos chapitres.',
  },
  {
    icone: '✂️',
    titre: 'Découper',
    texte:
      'Le livre est dépecé en chapitres, puis en segments courts — la matière de la traduction fidèle.',
  },
  {
    icone: '🖋️',
    titre: 'Traduire',
    texte:
      'Chaque segment devient français, dans l’ordre, avec reprise automatique si un moteur trébuche.',
  },
  {
    icone: '📖',
    titre: 'Relire & exporter',
    texte:
      'Lisez dans un lecteur réglable (police, taille, thème) et repartez avec vos exports.',
  },
];

const PROMESSES = [
  {
    titre: 'Vos textes restent privés',
    texte:
      'Chaque compte ne voit que ses propres livres (règles d’accès au niveau de la base). Aucune bibliothèque publique, aucun partage.',
  },
  {
    titre: 'Un livre entier, jamais à moitié',
    texte:
      'La traduction va au bout : les segments en échec sont signalés et repris plutôt que laissés en trou.',
  },
  {
    titre: 'La reprise de lecture',
    texte:
      'Vous fermez l’onglet, vous revenez : la bibliothèque retient où vous en étiez.',
  },
  {
    titre: 'Des exports utiles',
    texte:
      'Markdown, Word (.docx) et PDF adapté au réassemblage — plus un PDF qui épouse la mise en page d’origine.',
  },
];

export default async function Accueil() {
  const utilisateur = await utilisateurConnecte();
  const connecte = Boolean(utilisateur);

  const ctaPrincipal = connecte
    ? { href: '/bibliotheque', libelle: 'Entrer dans ma bibliothèque' }
    : { href: '/connexion?mode=inscription', libelle: 'Créer mon compte' };

  return (
    <>
      {/* ---------------- Héros ---------------- */}
      <section className="mx-auto max-w-4xl px-4 sm:px-6 pt-14 sm:pt-20 pb-4 text-center">
        <Image
          src="/logo.png"
          alt="Plume d’Ombres"
          width={200}
          height={200}
          priority
          className="mx-auto h-28 w-28 sm:h-32 sm:w-32 object-contain mb-6 animate-fondu-monte"
        />
        <p className="text-grenat-400 tracking-[0.45em] text-[11px] sm:text-xs uppercase mb-4 animate-lueur-lente">
          ✦ traduire la nuit, chapitre par chapitre ✦
        </p>
        <h1 className="font-display text-4xl sm:text-6xl leading-tight text-encre-100">
          Plume <span className="texte-douche italic">d’Ombres</span>
        </h1>
        <div className="liseret mx-auto mt-6" />
        <p className="text-encre-300 text-base sm:text-lg mt-6 leading-relaxed max-w-2xl mx-auto">
          Importez un roman en anglais : Plume d’Ombres le découpe en
          chapitres, le traduit en français et vous le rend dans un lecteur
          au confort réglable — prêt à exporter, sans perdre la morsure du
          texte.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link href={ctaPrincipal.href} className="bouton-principal !px-6 !py-3 text-base">
            {ctaPrincipal.libelle}
          </Link>
          <a href="#prix" className="bouton-fantome !px-6 !py-3 text-base">
            Voir le prix
          </a>
        </div>

        <p className="text-encre-500 text-xs mt-4 italic">
          Gratuit pendant le lancement — aucun moyen de paiement demandé.
        </p>
      </section>

      {/* ---------------- Le concept ---------------- */}
      <SectionPublique
        id="concept"
        surTitre="Le concept"
        titre="Un rituel en quatre temps"
        intro="Plume d’Ombres n’est pas un traducteur jetable : c’est un atelier personnel. Un livre entre, un livre traduit et lisible ressort."
      >
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {RITUEL.map((etape, i) => (
            <li key={etape.titre} className="velours p-5 flex flex-col gap-2">
              <span className="text-2xl" aria-hidden>
                {etape.icone}
              </span>
              <p className="text-[11px] uppercase tracking-[0.2em] text-encre-500">
                Étape {i + 1}
              </p>
              <h3 className="font-display text-xl text-encre-100">{etape.titre}</h3>
              <p className="text-encre-500 text-sm leading-relaxed">{etape.texte}</p>
            </li>
          ))}
        </ol>
      </SectionPublique>

      {/* ---------------- Formats acceptés ---------------- */}
      <SectionPublique
        id="formats"
        surTitre="Formats"
        titre="Ce que le studio accepte"
        intro="Tous les formats passent par le même pipeline : extraction du texte, repérage des chapitres, découpage, traduction, réassemblage."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FORMATS.map((f) => (
            <div key={f.ext} className="velours p-5">
              <p className="font-display text-2xl text-grenat-300">{f.ext}</p>
              <p className="text-encre-500 text-sm mt-2 leading-relaxed">{f.note}</p>
            </div>
          ))}
        </div>

        <div className="velours p-5 mt-4">
          <p className="sur-titre text-encre-300">Langues proposées</p>
          <p className="text-encre-300 text-sm mt-3 leading-relaxed">
            Traduction vers le <strong className="text-encre-100">français</strong> depuis
            l’anglais, l’espagnol, l’italien, le portugais, l’allemand — et entre ces six
            langues.
          </p>
          <p className="text-encre-500 text-xs mt-3 leading-relaxed italic">
            Un PDF scanné (photocopie, image sans couche texte) ne peut pas être lu :
            choisissez plutôt .txt, .md ou .epub, ou repartez d’un PDF dont le texte est
            sélectionnable.
          </p>
        </div>
      </SectionPublique>

      {/* ---------------- La promesse ---------------- */}
      <SectionPublique
        id="promesse"
        surTitre="La promesse"
        titre="Ce que Plume d’Ombres garantit"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {PROMESSES.map((p) => (
            <div key={p.titre} className="velours p-5">
              <h3 className="font-display text-lg text-encre-100">{p.titre}</h3>
              <p className="text-encre-500 text-sm mt-2 leading-relaxed">{p.texte}</p>
            </div>
          ))}
        </div>

        <div className="velours p-5 mt-4">
          <p className="sur-titre text-encre-300">
            Ce que le studio ne fait pas <span className="normal-case tracking-normal">(encore)</span>
          </p>
          <ul className="mt-3 space-y-2 text-sm text-encre-500 leading-relaxed list-disc pl-5">
            <li>
              <strong className="text-encre-300">Pas de paiement en ligne</strong> : l’offre
              payante est annoncée mais pas ouverte.
            </li>
            <li>
              <strong className="text-encre-300">Pas d’OCR</strong> ni de PDF scanné, pas
              encore de DOCX en entrée.
            </li>
            <li>
              <strong className="text-encre-300">Pas d’export EPUB</strong> pour l’instant
              (prévu), ni de glossaire de personnages.
            </li>
          </ul>
        </div>
      </SectionPublique>

      {/* ---------------- Prix ---------------- */}
      <SectionPublique
        id="prix"
        surTitre="Prix"
        titre="Gratuit aujourd’hui, premium bientôt"
        intro="Pendant le lancement, tout est ouvert : importer, traduire, lire, exporter. Aucune carte bancaire."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="velours p-6 flex flex-col">
            <p className="sur-titre text-grenat-300">Offre de lancement</p>
            <p className="font-display text-4xl text-encre-100 mt-3">0 €</p>
            <p className="text-encre-500 text-xs mt-1">sans engagement</p>
            <ul className="mt-5 space-y-2 text-sm text-encre-300 leading-relaxed list-disc pl-5 flex-1">
              <li>Import illimité de vos fichiers (.txt, .md, .pdf texte, .epub)</li>
              <li>Traduction, lecture complète et reprise de position</li>
              <li>Favoris, tri, filtres et tous les exports</li>
              <li>Un compte, et vous seul voyez vos livres</li>
            </ul>
            <Link
              href={ctaPrincipal.href}
              className="bouton-principal mt-6 justify-center"
            >
              {connecte ? 'Entrer dans ma bibliothèque' : 'Créer mon compte'}
            </Link>
          </div>

          <div className="velours p-6 flex flex-col relative overflow-hidden">
            <div className="absolute top-4 right-4">
              <span className="rounded-full border border-violet-rom-500/60 bg-violet-rom-500/15 text-violet-rom-300 text-[10px] uppercase tracking-wider px-2.5 py-1">
                bientôt disponible
              </span>
            </div>
            <p className="sur-titre text-violet-rom-300">Premium — annoncé</p>
            <p className="font-display text-3xl text-encre-100 mt-3">
              Prix non encore fixé
            </p>
            <p className="text-encre-500 text-xs mt-1">
              placeholder — tarif à arrêter avant l’ouverture du paiement
            </p>
            <ul className="mt-5 space-y-2 text-sm text-encre-500 leading-relaxed list-disc pl-5 flex-1">
              <li>Quota de traduction élargi (plusieurs livres par mois)</li>
              <li>Plusieurs livres traduits en parallèle</li>
              <li>Qualité littéraire supérieure et file prioritaire</li>
              <li>Export EPUB et glossaire de personnages</li>
            </ul>
            <p className="text-encre-500 text-xs mt-6 italic">
              Le paiement n’est pas encore en place. Aucune somme ne peut être prélevée
              aujourd’hui.
            </p>
          </div>
        </div>
      </SectionPublique>

      {/* ---------------- Rappel final ---------------- */}
      <section className="mx-auto max-w-3xl px-4 sm:px-6 pb-16 text-center">
        <div className="velours p-8">
          <p className="font-display text-2xl text-encre-100">
            Une romance attend que quelqu’un la fasse parler français.
          </p>
          <p className="text-encre-500 text-sm mt-3 italic">
            Créez votre compte, déposez le fichier, laissez l’encre couler.
          </p>
          <Link
            href={ctaPrincipal.href}
            className="bouton-principal mt-6 !px-6 !py-3 text-base"
          >
            {connecte ? 'Ouvrir ma bibliothèque' : 'Commencer gratuitement'}
          </Link>
        </div>
      </section>
    </>
  );
}
