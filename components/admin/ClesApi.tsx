'use client';

// ============================================================
// components/admin/ClesApi.tsx — Réservoir de clés d'API.
//
// Onglet « Clés API » du tableau de bord : coller autant de clés
// que nécessaire, pour plusieurs fournisseurs (Gemini, DeepSeek,
// OpenAI, OpenRouter, Mistral, autre) et plusieurs fois le même
// (ex. 3 clés Gemini). Les clés d'un fournisseur forment une file
// de SUCCESSION alignée : la première sert, la suivante prend le
// relais si elle lâche (temps de repos automatique après 3 échecs
// de suite). Une clé peut être réservée à un niveau d'abonnement.
//
// SÉCURITÉ : la valeur complète n'est jamais renvoyée ici — seul
// un aperçu masqué (AIza…x9Qz). Les écritures passent par
// /api/admin/cles-api (garde admin + RLS public.est_admin()).
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Plus,
  Power,
  Trash2,
  Zap,
} from 'lucide-react';

import ModaleConfirmation from '@/components/admin/ModaleConfirmation';
import { FOURNISSEURS, metaFournisseur } from '@/lib/cles-api-fournisseurs';

export interface CoteCle {
  id: string;
  fournisseur: string;
  libelle: string;
  apercu: string | null;
  planMinimal: 'lecteur' | 'passionne' | 'illimite' | null;
  position: number;
  actif: boolean;
  echecsConsecutifs: number;
  suspendueLe: string | null;
  derniereErreur: string | null;
  majLe: string | null;
}

export interface EtatAncienneCle {
  defini: boolean;
  apercu: string | null;
  majLe: string | null;
}

const LIBELLES_PLAN: Record<string, string> = {
  lecteur: 'Lecteur et plus',
  passionne: 'Passionné et plus',
  illimite: 'Illimité',
};

const COOLDOWN_MS = 60_000;

function badgeEtat(cle: CoteCle, maintenant: number): { texte: string; classe: string } {
  if (!cle.actif) {
    return { texte: 'Désactivée', classe: 'bg-nuit-800 text-encre-500 border-nuit-700' };
  }
  if (cle.suspendueLe) {
    const instant = Date.parse(cle.suspendueLe);
    if (!Number.isNaN(instant) && maintenant - instant < COOLDOWN_MS) {
      const restant = Math.max(1, Math.ceil((COOLDOWN_MS - (maintenant - instant)) / 1000));
      return {
        texte: `En repos (${restant} s)`,
        classe: 'text-grenat-300 border-grenat-500/40 bg-grenat-500/10',
      };
    }
  }
  if (cle.echecsConsecutifs > 0) {
    return {
      texte: `Active (${cle.echecsConsecutifs} échec${cle.echecsConsecutifs > 1 ? 's' : ''})`,
      classe: 'text-or-ros-300 border-or-ros-300/40 bg-or-ros-300/10',
    };
  }
  return { texte: 'Active', classe: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40' };
}

export default function ClesApi({
  clesInitiales,
  ancienne,
}: {
  clesInitiales: CoteCle[];
  ancienne: EtatAncienneCle;
}) {
  const router = useRouter();
  const [cles, setCles] = useState<CoteCle[]>(clesInitiales);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<{ ton: 'ok' | 'erreur'; texte: string } | null>(
    null
  );
  const [retirerCible, setRetirerCible] = useState<CoteCle | null>(null);

  // Test manuel d'une clé : une seule sonde à la fois, résultat
  // affiché SOUS le libellé de la ligne concernée.
  const [testEnCours, setTestEnCours] = useState<string | null>(null);
  const [resultatsTest, setResultatsTest] = useState<
    Record<string, { ton: 'ok' | 'erreur'; texte: string }>
  >({});

  // Formulaire d'ajout
  const [fournisseur, setFournisseur] = useState('gemini');
  const [libelle, setLibelle] = useState('');
  const [valeur, setValeur] = useState('');
  const [planMinimal, setPlanMinimal] = useState('');
  const [afficher, setAfficher] = useState(false);

  // Horloge : elle ne tourne QUE pendant un temps de repos, pour
  // animer le décompte « En repos (N s) » et réafficher la clé comme
  // de retour dans la rotation dès que le repos expire.
  const reposEnCours = cles.some((c) => c.suspendueLe);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    if (!reposEnCours) return undefined;
    const minuteur = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(minuteur);
  }, [reposEnCours]);

  async function envoyer(
    methode: 'POST' | 'PATCH' | 'DELETE',
    corps?: Record<string, unknown>
  ): Promise<boolean> {
    setEnCours(true);
    setMessage(null);
    try {
      const reponse = await fetch('/api/admin/cles-api', {
        method: methode,
        headers: { 'Content-Type': 'application/json' },
        body: corps === undefined ? undefined : JSON.stringify(corps),
      });
      const reponseCorps = (await reponse.json().catch(() => ({}))) as { erreur?: string };
      if (!reponse.ok) {
        setMessage({ ton: 'erreur', texte: reponseCorps.erreur ?? 'Échec de l’opération.' });
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setMessage({ ton: 'erreur', texte: 'Réseau indisponible.' });
      return false;
    } finally {
      setEnCours(false);
    }
  }

  async function ajouter() {
    const valeurPropre = valeur.trim();
    if (valeurPropre.length < 20) {
      setMessage({
        ton: 'erreur',
        texte: 'Cette clé est trop courte : collez la clé complète (au moins 20 caractères).',
      });
      return;
    }
    const ok = await envoyer('POST', {
      fournisseur,
      libelle: libelle.trim() || metaFournisseur(fournisseur).libelle,
      valeur: valeurPropre,
      planMinimal: planMinimal === '' ? null : planMinimal,
    });
    if (ok) {
      setValeur('');
      setLibelle('');
      setPlanMinimal('');
      setMessage({ ton: 'ok', texte: 'Clé ajoutée en fin de succession.' });
    }
  }

  function majLocale(id: string, changements: Partial<CoteCle>) {
    setCles((liste) => liste.map((c) => (c.id === id ? { ...c, ...changements } : c)));
  }

  async function changerPlan(cle: CoteCle, plan: string) {
    majLocale(cle.id, {
      planMinimal: plan === '' ? null : (plan as CoteCle['planMinimal']),
    });
    await envoyer('PATCH', { id: cle.id, planMinimal: plan === '' ? null : plan });
  }

  async function basculer(cle: CoteCle) {
    majLocale(cle.id, { actif: !cle.actif });
    await envoyer('PATCH', { id: cle.id, actif: !cle.actif });
  }

  async function deplacer(cle: CoteCle, direction: 'monter' | 'descendre') {
    await envoyer('PATCH', { id: cle.id, direction });
  }

  // Sonde une clé : requête de contrôle auprès du fournisseur (sans
  // consommation de quota). Le serveur met à jour les signaux de
  // santé ; la ligne est rafraîchie localement avec la réponse.
  async function tester(cle: CoteCle) {
    setTestEnCours(cle.id);
    setMessage(null);
    try {
      const reponse = await fetch('/api/admin/cles-api/tester', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cle.id }),
      });
      const corps = (await reponse.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        erreur?: string;
        echecsConsecutifs?: number;
        suspendueLe?: string | null;
        derniereErreur?: string | null;
      };
      if (!reponse.ok) {
        setResultatsTest((r) => ({
          ...r,
          [cle.id]: { ton: 'erreur', texte: corps.erreur ?? 'Test impossible.' },
        }));
        return;
      }
      const ok = corps.ok === true;
      majLocale(cle.id, {
        echecsConsecutifs: ok ? 0 : (corps.echecsConsecutifs ?? cle.echecsConsecutifs),
        suspendueLe: ok ? null : (corps.suspendueLe ?? cle.suspendueLe),
        derniereErreur: ok ? null : (corps.derniereErreur ?? cle.derniereErreur),
      });
      setResultatsTest((r) => ({
        ...r,
        [cle.id]: {
          ton: ok ? 'ok' : 'erreur',
          texte: corps.message ?? (ok ? 'Clé valide.' : 'Clé refusée.'),
        },
      }));
      router.refresh();
    } catch {
      setResultatsTest((r) => ({
        ...r,
        [cle.id]: { ton: 'erreur', texte: 'Réseau indisponible.' },
      }));
    } finally {
      setTestEnCours(null);
    }
  }

  async function retirer() {
    if (!retirerCible) return;
    const cible = retirerCible;
    setRetirerCible(null);
    const ok = await envoyer('DELETE', undefined);
    if (ok) {
      setCles((liste) => liste.filter((c) => c.id !== cible.id));
      setMessage({ ton: 'ok', texte: 'Clé retirée.' });
    }
  }

  // Groupement par fournisseur, dans l'ordre du catalogue.
  const groupes = useMemo(() => {
    const carte = new Map<string, CoteCle[]>();
    for (const f of FOURNISSEURS) {
      const liste = cles.filter((c) => c.fournisseur === f.id);
      if (liste.length > 0) carte.set(f.id, liste);
    }
    return [...carte.entries()];
  }, [cles]);

  const ancienneDejaMigree = ancienne.defini
    ? cles.some((c) => c.fournisseur === 'gemini' && c.apercu === ancienne.apercu)
    : false;

  return (
    <section
      className="velours p-5 sm:p-6 space-y-6 rounded-2xl border border-nuit-700"
      aria-labelledby="titre-cles-api"
    >
      <div>
        <h2 id="titre-cles-api" className="font-display text-lg text-encre-100">
          Clés d’API du site
        </h2>
        <p className="text-sm text-encre-300 mt-1">
          Coller ici les clés d’API du site : plusieurs fournisseurs, plusieurs clés
          du même fournisseur. Dans chaque fournisseur, les clés se succèdent dans
          l’ordre affiché : la première sert ; si elle lâche (quota, accès), la
          suivante prend le relais, et la première reprend après un court repos.
          Une clé peut être réservée à un abonnement précis.
        </p>
      </div>

      {/* ---------- Ajouter une clé ---------- */}
      <div className="rounded-[12px] border border-nuit-700/60 bg-nuit-800/40 p-3 sm:p-4 space-y-3">
        <h3 className="sur-titre text-encre-300 text-[11px]">Ajouter une clé</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-encre-500">
            Fournisseur
            <select
              className="select-sombre champ-sombre mt-1 w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2.5 text-sm text-encre-100"
              value={fournisseur}
              disabled={enCours}
              onChange={(e) => setFournisseur(e.target.value)}
            >
              {FOURNISSEURS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.libelle}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-encre-500">
            Libellé (pour vous y retrouver)
            <input
              type="text"
              className="champ-sombre mt-1 w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2.5 text-sm text-encre-100"
              value={libelle}
              disabled={enCours}
              autoComplete="off"
              placeholder="ex. Gemini compte 2"
              onChange={(e) => setLibelle(e.target.value)}
            />
          </label>
          <label className="block text-xs text-encre-500">
            Abonnement servi
            <select
              className="select-sombre champ-sombre mt-1 w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2.5 text-sm text-encre-100"
              value={planMinimal}
              disabled={enCours}
              onChange={(e) => setPlanMinimal(e.target.value)}
            >
              <option value="">Tous les abonnements</option>
              {Object.entries(LIBELLES_PLAN).map(([valeurPlan, libellePlan]) => (
                <option key={valeurPlan} value={valeurPlan}>
                  {libellePlan}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-encre-500">
            Clé d’API {afficher ? '(visible)' : '(masquée à la saisie)'}
            <div className="flex gap-2 mt-1">
              <input
                type={afficher ? 'text' : 'password'}
                className="champ-sombre w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2.5 text-sm text-encre-100"
                value={valeur}
                disabled={enCours}
                autoComplete="off"
                spellCheck={false}
                placeholder={metaFournisseur(fournisseur).indice}
                onChange={(e) => setValeur(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    ajouter();
                  }
                }}
              />
              <button
                type="button"
                className="bouton-fantome min-h-11 text-sm shrink-0"
                onClick={() => setAfficher((a) => !a)}
              >
                {afficher ? (
                  <EyeOff className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Eye className="w-4 h-4" aria-hidden="true" />
                )}
                {afficher ? 'Masquer' : 'Afficher'}
              </button>
            </div>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="bouton-principal min-h-11 text-sm"
            disabled={enCours || valeur.trim().length === 0}
            onClick={ajouter}
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Ajouter la clé
          </button>
          <span className="text-xs text-encre-500">
            {metaFournisseur(fournisseur).usage}
          </span>
        </div>
      </div>

      {/* ---------- Ancienne clé unique (filet de sécurité) ---------- */}
      {ancienne.defini && (
        <p className="text-xs text-encre-500 rounded-lg border border-nuit-700 bg-nuit-800/40 px-3 py-2">
          Ancienne clé unique collée dans « Fonctionnalités »
          {ancienne.apercu ? ` (${ancienne.apercu})` : ''} : toujours lisible en
          secours.{' '}
          {ancienneDejaMigree
            ? 'Une copie est déjà dans le réservoir ci-dessous.'
            : 'La nouvelle migration SQL la copie automatiquement en première position.'}
        </p>
      )}

      {/* ---------- Files de succession, un bloc par fournisseur ---------- */}
      {groupes.length === 0 ? (
        <p className="text-sm text-encre-500 italic">
          Aucune clé enregistrée pour le moment. La variable d’environnement
          <code className="mx-1">GEMINI_API_KEY</code> reste prioritaire quand elle
          existe.
        </p>
      ) : (
        groupes.map(([idFournisseur, liste]) => {
          const meta = metaFournisseur(idFournisseur);
          return (
            <div key={idFournisseur} className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="sur-titre text-encre-300">{meta.libelle}</h3>
                <span className="text-xs text-encre-500">
                  {liste.length} clé{liste.length > 1 ? 's' : ''} — succession de haut
                  en bas
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">
                    File de succession des clés {meta.libelle}.
                  </caption>
                  <thead>
                    <tr className="text-left text-encre-500 text-xs uppercase tracking-wider">
                      <th scope="col" className="py-2 pr-2 font-normal w-8">#</th>
                      <th scope="col" className="py-2 pr-2 font-normal">Libellé</th>
                      <th scope="col" className="py-2 pr-2 font-normal">Clé</th>
                      <th scope="col" className="py-2 pr-2 font-normal">Abonnement</th>
                      <th scope="col" className="py-2 pr-2 font-normal">État</th>
                      <th scope="col" className="py-2 font-normal text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liste.map((cle, index) => {
                      const etat = badgeEtat(cle, maintenant);
                      return (
                        <tr
                          key={cle.id}
                          className="border-t border-nuit-700/50 align-middle"
                        >
                          <td className="py-2 pr-2 chiffres-tabulaires text-encre-500">
                            {index + 1}
                          </td>
                          <td className="py-2 pr-2 text-encre-100">
                            {cle.libelle}
                            {cle.derniereErreur && (
                              <span className="block text-xs text-grenat-300/80 max-w-[240px] truncate" title={cle.derniereErreur}>
                                {cle.derniereErreur}
                              </span>
                            )}
                            {resultatsTest[cle.id] && (
                              <span
                                className={
                                  'block text-xs max-w-[240px] ' +
                                  (resultatsTest[cle.id].ton === 'ok'
                                    ? 'text-emerald-300'
                                    : 'text-grenat-300')
                                }
                              >
                                {resultatsTest[cle.id].texte}
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-2 chiffres-tabulaires text-encre-300">
                            {cle.apercu ?? '••••'}
                          </td>
                          <td className="py-2 pr-2">
                            <select
                              className="select-sombre rounded-lg border border-nuit-700 bg-nuit-850 px-2 py-1.5 text-xs text-encre-100"
                              value={cle.planMinimal ?? ''}
                              disabled={enCours}
                              aria-label={`Abonnement servi par ${cle.libelle}`}
                              onChange={(e) => changerPlan(cle, e.target.value)}
                            >
                              <option value="">Tous</option>
                              {Object.entries(LIBELLES_PLAN).map(([valeurPlan, libellePlan]) => (
                                <option key={valeurPlan} value={valeurPlan}>
                                  {libellePlan}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 pr-2">
                            <span
                              className={
                                'inline-block rounded-full px-2.5 py-1 text-xs font-medium border ' +
                                etat.classe
                              }
                            >
                              {etat.texte}
                            </span>
                          </td>
                          <td className="py-2 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                className="bouton-fantome min-h-11 min-w-[44px] text-sm px-2"
                                disabled={enCours || index === 0}
                                aria-label={`Faire monter ${cle.libelle} dans la succession`}
                                title="Faire monter (servie avant la précédente)"
                                onClick={() => deplacer(cle, 'monter')}
                              >
                                <ChevronUp className="w-4 h-4" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                className="bouton-fantome min-h-11 min-w-[44px] text-sm px-2"
                                disabled={enCours || index === liste.length - 1}
                                aria-label={`Faire descendre ${cle.libelle} dans la succession`}
                                title="Faire descendre (servie après)"
                                onClick={() => deplacer(cle, 'descendre')}
                              >
                                <ChevronDown className="w-4 h-4" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                className="bouton-fantome min-h-11 text-xs px-2"
                                disabled={enCours || testEnCours !== null}
                                title="Envoyer une requête de contrôle au fournisseur (sans consommer de quota de génération)"
                                onClick={() => tester(cle)}
                              >
                                <Zap className="w-3.5 h-3.5" aria-hidden="true" />
                                {testEnCours === cle.id ? 'Test…' : 'Tester'}
                              </button>
                              <button
                                type="button"
                                className="bouton-fantome min-h-11 text-xs px-2"
                                disabled={enCours}
                                onClick={() => basculer(cle)}
                              >
                                <Power className="w-3.5 h-3.5" aria-hidden="true" />
                                {cle.actif ? 'Désactiver' : 'Réactiver'}
                              </button>
                              <button
                                type="button"
                                className="bouton-fantome min-h-11 text-xs px-2 text-grenat-300"
                                disabled={enCours}
                                onClick={() => setRetirerCible(cle)}
                              >
                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                                Retirer
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}

      <p className="text-xs text-encre-500">
        Les clés sont stockées côté serveur, lisibles uniquement par les
        administrateurs et le rôle service, et jamais renvoyées en clair au
        navigateur. Pour que les modules d’IA servent tous les abonnés à partir de
        ce réservoir, définissez la variable
        <code className="mx-1">SUPABASE_SERVICE_ROLE_KEY</code> chez l’hébergeur ;
        sinon, seules les sessions administrateur peuvent s’en servir.
      </p>

      {message && (
        <p
          role="status"
          className={
            'text-sm px-3 py-2 rounded-lg border ' +
            (message.ton === 'ok'
              ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
              : 'text-grenat-300 border-grenat-500/40 bg-grenat-500/10')
          }
        >
          {message.texte}
        </p>
      )}

      <ModaleConfirmation
        ouvert={retirerCible !== null}
        titre="Retirer cette clé ?"
        description={`« ${retirerCible?.libelle ?? ''} » (${retirerCible?.apercu ?? ''}) ne servira plus. Les clés suivantes prendront automatiquement le relais.`}
        libelleConfirmer="Retirer la clé"
        enCours={enCours}
        onConfirmer={retirer}
        onAnnuler={() => setRetirerCible(null)}
      />
    </section>
  );
}
