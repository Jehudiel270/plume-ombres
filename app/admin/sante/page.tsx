// ============================================================
// app/admin/sante/page.tsx — Supervision du studio (P1.6).
//
// GARDE SERVEUR : permission `admin.stats.voir` (source de vérité
// lib/roles.ts). Un compte connecté non admin est renvoyé vers sa
// bibliothèque avec `refus=admin.stats.voir` ; un visiteur vers la
// connexion.
//
// CONFIDENTIALITÉ : cette page n'affiche QUE des agrégats calculés
// en base (public.sante_studio, SECURITY DEFINER, contrôle admin
// interne) et normalisés par lib/sante.ts (listes blanches
// strictes). Aucun titre, aucun texte source ni traduit n'y
// transite — voir SAUVEGARDE.md et scripts/test-sante.ts pour la
// preuve exécutable.
// ============================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { creerClientServeur } from '@/lib/supabase/server';
import { exigerPermission } from '@/lib/roles-garde';
import BarreNavigation from '@/components/BarreNavigation';
import {
  collecterSanteStudio,
  collecterSanteMachine,
  etatGlobal,
  formaterNombre,
  formaterSecondes,
  formaterMillisecondes,
  formaterTaux,
  formaterHorodatage,
  libelleFournisseur,
  SEUIL_ERREURS_24H,
  type SanteStudio,
  type SanteMachine,
} from '@/lib/sante';
import type { ClientRpc } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Santé du studio',
  description: 'Supervision : traductions, durées, moteurs et usage. Agrégats seuls.',
};

function Carte({
  libelle,
  valeur,
  detail,
}: {
  libelle: string;
  valeur: string;
  detail?: string;
}) {
  return (
    <div className="velours p-5">
      <p className="sur-titre text-encre-300">{libelle}</p>
      <p className="font-display text-3xl text-encre-100 mt-2">{valeur}</p>
      {detail && <p className="text-encre-500 text-xs mt-1">{detail}</p>}
    </div>
  );
}

function Section({
  titre,
  aide,
  children,
}: {
  titre: string;
  aide?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="velours p-6" aria-label={titre}>
      <p className="sur-titre text-encre-300">{titre}</p>
      {aide && <p className="text-encre-500 text-xs mt-1">{aide}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function PageSante() {
  // Source de vérité : le garde serveur (redirige sinon).
  await exigerPermission('admin.stats.voir', '/admin/sante');

  const supabase = await creerClientServeur();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const clientRpc: ClientRpc = { rpc: (nom, args) => supabase.rpc(nom, args) };

  const [{ data: profil }, resultat, resultatMachine] = await Promise.all([
    supabase.from('profiles').select('pseudo, role').eq('id', user?.id ?? '').maybeSingle(),
    collecterSanteStudio(clientRpc, 30),
    collecterSanteMachine(clientRpc),
  ]);

  const pseudo =
    (profil as { pseudo?: string } | null)?.pseudo ||
    (user?.email?.split('@')[0] ?? 'Administrateur');
  const role = (profil as { role?: string } | null)?.role ?? 'admin';

  const sante: SanteStudio | null = resultat.donnees;
  const machine: SanteMachine | null = resultatMachine.donnees;
  const etat = machine ? etatGlobal(machine) : null;

  return (
    <>
      <BarreNavigation email={user?.email ?? ''} pseudo={pseudo} role={role} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8 animate-fondu-monte">
        <div>
          <p className="sur-titre text-grenat-400">Administration</p>
          <h1 className="font-display text-3xl text-encre-100 mt-2">Santé du studio</h1>
          <div className="liseret mt-3" />
          <p className="text-encre-500 text-sm mt-3 italic">
            Traductions, durées, moteurs et usage. Toutes les valeurs sont des agrégats
            calculés en base : aucun contenu de livre n’est lisible ni journalisé.
          </p>
          <p className="text-encre-500 text-xs mt-2">
            <Link href="/admin" className="underline hover:text-encre-300">
              ← Retour au tableau de bord
            </Link>
          </p>
        </div>

        {resultat.erreur && (
          <p className="text-grenat-300 text-sm rounded-lg border border-grenat-500/40 bg-grenat-500/10 px-3 py-2">
            Supervision indisponible : {resultat.erreur}
          </p>
        )}

        {sante && (
          <>
            <section
              aria-label="Traductions"
              className="grid grid-cols-2 lg:grid-cols-4 gap-4"
            >
              <Carte
                libelle="Traductions en cours"
                valeur={formaterNombre(sante.traductions.enCours)}
                detail={`${formaterNombre(sante.essaisEnCours.segments)} segments en vol`}
              />
              <Carte
                libelle="Traductions terminées"
                valeur={formaterNombre(sante.traductions.termine)}
                detail={`sur ${formaterNombre(sante.traductions.total)} chapitres`}
              />
              <Carte
                libelle="Traductions en erreur"
                valeur={formaterNombre(sante.traductions.erreur)}
                detail={`${formaterNombre(sante.segments.erreur)} segments en erreur`}
              />
              <Carte
                libelle="Essais en cours"
                valeur={formaterNombre(sante.essaisEnCours.chapitres)}
                detail="chapitres marqués « en traduction »"
              />
            </section>

            <section className="grid grid-cols-2 lg:grid-cols-4 gap-4" aria-label="Durées">
              <Carte
                libelle="Temps moyen / chapitre"
                valeur={formaterSecondes(sante.durees.moyenneChapitreS)}
                detail={`${formaterNombre(sante.durees.chapitresMesures)} chapitres mesurés`}
              />
              <Carte
                libelle="Temps moyen / livre"
                valeur={formaterSecondes(sante.durees.moyenneLivreS)}
                detail={`${formaterNombre(sante.durees.livresMesures)} livres mesurés`}
              />
              <Carte
                libelle="Taille moyenne / chapitre"
                valeur={`${formaterNombre(sante.taille.caracteresMoyenChapitre)} car.`}
                detail={`${formaterNombre(sante.taille.segmentsMoyenChapitre)} segments en moyenne`}
              />
              <Carte
                libelle="Taille moyenne / livre"
                valeur={`${formaterNombre(sante.taille.caracteresMoyenLivre)} car.`}
                detail="caractères source, calculés depuis les segments"
              />
            </section>

            <Section
              titre="Taux d’échec par fournisseur"
              aide={`Fenêtre : ${formaterNombre(sante.fenetreJours)} derniers jours. Catégories techniques uniquement.`}
            >
              {sante.fournisseurs.length === 0 ? (
                <p className="text-encre-500 text-sm italic">
                  Aucun événement de traduction journalisé sur la période.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-encre-500 text-xs uppercase tracking-wider">
                      <th className="py-2 font-normal">Fournisseur</th>
                      <th className="py-2 font-normal text-right">Tentatives</th>
                      <th className="py-2 font-normal text-right">Succès</th>
                      <th className="py-2 font-normal text-right">Échecs</th>
                      <th className="py-2 font-normal text-right">Taux d’échec</th>
                      <th className="py-2 font-normal text-right">Durée moyenne</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sante.fournisseurs.map((f) => (
                      <tr key={f.fournisseur} className="border-t border-nuit-700/50">
                        <td className="py-2 text-encre-200">
                          {libelleFournisseur(f.fournisseur)}
                        </td>
                        <td className="py-2 text-encre-300 text-right">
                          {formaterNombre(f.total)}
                        </td>
                        <td className="py-2 text-encre-300 text-right">
                          {formaterNombre(f.succes)}
                        </td>
                        <td className="py-2 text-encre-300 text-right">
                          {formaterNombre(f.echecs)}
                        </td>
                        <td className="py-2 text-encre-100 text-right">
                          {formaterTaux(f.tauxEchec)}
                        </td>
                        <td className="py-2 text-encre-300 text-right">
                          {formaterMillisecondes(f.dureeMoyenneMs)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            <Section
              titre="Caractères consommés ce mois"
              aide={`Période ${sante.usageMois.periode} — total ${formaterNombre(
                sante.usageMois.total
              )} caractères.`}
            >
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <p className="text-encre-400 text-xs uppercase tracking-wider mb-2">
                    Par plan
                  </p>
                  {sante.usageMois.parPlan.length === 0 ? (
                    <p className="text-encre-500 text-sm italic">Aucune consommation.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <tbody>
                        {sante.usageMois.parPlan.map((p) => (
                          <tr key={p.plan} className="border-t border-nuit-700/50">
                            <td className="py-2 text-encre-200">{p.plan}</td>
                            <td className="py-2 text-encre-500 text-right">
                              {formaterNombre(p.comptes)} comptes
                            </td>
                            <td className="py-2 text-encre-100 text-right">
                              {formaterNombre(p.caracteres)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                <div>
                  <p className="text-encre-400 text-xs uppercase tracking-wider mb-2">
                    Par utilisateur
                  </p>
                  {sante.usageMois.parCompte.length === 0 ? (
                    <p className="text-encre-500 text-sm italic">Aucune consommation.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <tbody>
                        {sante.usageMois.parCompte.map((c) => (
                          <tr
                            key={`${c.pseudo}-${c.plan}`}
                            className="border-t border-nuit-700/50"
                          >
                            <td className="py-2 text-encre-200">{c.pseudo}</td>
                            <td className="py-2 text-encre-500 text-right">{c.plan}</td>
                            <td className="py-2 text-encre-100 text-right">
                              {formaterNombre(c.caracteres)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </Section>

            <Section
              titre="Derniers événements d’erreur"
              aide="Type technique et moteur. Aucun message brut, aucun contenu."
            >
              {sante.erreursRecentes.length === 0 ? (
                <p className="text-encre-500 text-sm italic">
                  Aucune erreur de traduction journalisée.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-encre-500 text-xs uppercase tracking-wider">
                      <th className="py-2 font-normal">Quand</th>
                      <th className="py-2 font-normal">Fournisseur</th>
                      <th className="py-2 font-normal">Catégorie</th>
                      <th className="py-2 font-normal">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sante.erreursRecentes.map((e, i) => (
                      <tr key={`${e.quand}-${i}`} className="border-t border-nuit-700/50">
                        <td className="py-2 text-encre-300">{formaterHorodatage(e.quand)}</td>
                        <td className="py-2 text-encre-200">
                          {libelleFournisseur(e.fournisseur)}
                        </td>
                        <td className="py-2 text-encre-300">{e.categorie ?? '—'}</td>
                        <td className="py-2 text-encre-300">{e.statut}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            {machine && (
              <section
                className="velours p-6"
                aria-label="État machine"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="sur-titre text-encre-300">État machine</p>
                    <p className="text-encre-500 text-xs mt-1">
                      Point d’appel cron externe :
                      <Link href="/api/sante" className="underline hover:text-encre-300 ml-1">
                        /api/sante
                      </Link>
                    </p>
                  </div>
                  <span
                    className={`text-xs uppercase tracking-wider px-3 py-1 rounded-full border ${
                      etat === 'ok'
                        ? 'border-nuit-600 text-encre-200'
                        : etat === 'degrade'
                          ? 'border-grenat-500/60 text-grenat-300 bg-grenat-500/10'
                          : 'border-grenat-500 text-grenat-200 bg-grenat-500/20'
                    }`}
                  >
                    {etat === 'ok'
                      ? 'Opérationnel'
                      : etat === 'degrade'
                        ? 'Dégradé'
                        : 'Panne'}
                  </span>
                </div>
                <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
                  <div>
                    <dt className="text-encre-500 text-xs">File en retard</dt>
                    <dd className="text-encre-100">
                      {machine.fileEnRetard ? 'oui' : 'non'}
                      {machine.bloquesEnCours > 0 &&
                        ` (${formaterNombre(machine.bloquesEnCours)} bloqués)`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-encre-500 text-xs">Erreurs (24 h)</dt>
                    <dd className="text-encre-100">
                      {formaterNombre(machine.erreurs24h)} / {formaterNombre(machine.evenements24h)} événements
                    </dd>
                  </div>
                  <div>
                    <dt className="text-encre-500 text-xs">Segments en cours</dt>
                    <dd className="text-encre-100">{formaterNombre(machine.segmentsEnCours)}</dd>
                  </div>
                  <div>
                    <dt className="text-encre-500 text-xs">Dernière traduction</dt>
                    <dd className="text-encre-100">
                      {formaterHorodatage(machine.derniereTraduction)}
                    </dd>
                  </div>
                </dl>
                <p className="text-encre-500 text-xs mt-4">
                  Seuil d’alerte : {formaterNombre(SEUIL_ERREURS_24H)} erreurs sur 24 h, ou
                  toute file bloquée depuis plus de 15 minutes.
                </p>
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}
