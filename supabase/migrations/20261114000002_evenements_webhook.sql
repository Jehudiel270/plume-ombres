-- ============================================================
-- Plume d'Ombres — JOURNAL DES LIVRAISONS DE WEBHOOK
-- (vague 2 du tableau de bord).
--
-- Fichier ADDITIF et IDEMPOTENT. Ajoute la table `evenements_webhook`
-- : chaque notification de paiement reçue sur /api/paiement/webhook y
-- est tracée (succès, déjà traité = retente FedaPay, ou échec avec le
-- statut HTTP renvoyé). Objectif : VOIR dans le tableau de bord ce
-- que FedaPay a livré, ce qui a été rejoué et ce qui a échoué — sans
-- fouiller les journaux de l'hébergeur.
--
-- Écriture : uniquement le rôle service (la route webhook). Aucune
-- politique d'insertion : un compte authentifié ne peut RIEN y écrire.
-- Lecture : le SEUL rôle administrateur (RLS public.est_admin()), sur
-- le modèle de public.admin_actions.
--
-- Aucune donnée personnelle : référence interne (PLU-…), nom
-- d'événement, statut HTTP et message d'erreur. Pas de montant, pas
-- de téléphone, pas de courriel.
-- ============================================================

create table if not exists public.evenements_webhook (
  id bigint generated always as identity primary key,
  fournisseur text not null default 'fedapay',
  evenement text,
  reference text,
  statut_http smallint not null default 200,
  traite boolean not null default true,
  deja_traite boolean not null default false,
  erreur text,
  cree_le timestamptz not null default now()
);

create index if not exists evenements_webhook_cree_idx
  on public.evenements_webhook (cree_le desc);
create index if not exists evenements_webhook_reference_idx
  on public.evenements_webhook (reference) where reference is not null;

alter table public.evenements_webhook enable row level security;

-- Lecture réservée aux administrateurs (même esprit que admin_actions).
drop policy if exists "evenements_webhook_select_admin" on public.evenements_webhook;
create policy "evenements_webhook_select_admin" on public.evenements_webhook
  for select using (public.est_admin());

-- Aucune politique d'écriture : seul le rôle service (bypass RLS)
-- insère, depuis la route du webhook.
