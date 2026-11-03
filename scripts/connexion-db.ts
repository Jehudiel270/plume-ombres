// ============================================================
// connexion-db.ts — Connexion PostgreSQL des scripts de maintenance.
// Mêmes variables que les scripts d'inspection (.env.local ou
// environnement) : SUPABASE_DB_PASSWORD, SUPABASE_DB_HOST, etc.
// ============================================================
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

/** Lit une variable d'environnement, sinon la ligne `CLE=` de .env.local. */
export function lireEnv(cle: string): string {
  if (process.env[cle]) return process.env[cle] as string;
  try {
    const contenu = readFileSync('.env.local', 'utf8');
    const ligne = contenu
      .split('\n')
      .find((l) => l.trim().startsWith(`${cle}=`));
    if (!ligne) return '';
    return ligne
      .split('=')
      .slice(1)
      .join('=')
      .trim()
      .replace(/^["']|["']$/g, '');
  } catch {
    return '';
  }
}

/** Référence du projet déduite de l'hôte (db.<ref>.supabase.co). */
function extraireRef(hote: string): string {
  const m = hote.match(/^(?:db\.)?([a-z0-9]{20})\.supabase\.co$/i);
  if (m) return m[1];
  const p = hote.match(/postgres\.([a-z0-9]{20})$/i);
  return p ? p[1] : '';
}

/** Client PostgreSQL prêt à `connect()` (pooler IPv4 par défaut). */
export function creerClient(): Client {
  const ref =
    lireEnv('SUPABASE_PROJECT_REF') || extraireRef(lireEnv('SUPABASE_DB_HOST'));
  const motDePasse = lireEnv('SUPABASE_DB_PASSWORD');
  if (!motDePasse) {
    throw new Error(
      'SUPABASE_DB_PASSWORD introuvable (variables d’environnement ou .env.local).'
    );
  }
  const port = Number(lireEnv('SUPABASE_DB_PORT') || 5432);
  const base = lireEnv('SUPABASE_DB_NAME') || 'postgres';
  const utilisateur =
    lireEnv('SUPABASE_DB_USER') || (ref ? `postgres.${ref}` : 'postgres');
  const hote =
    lireEnv('SUPABASE_DB_POOLER_HOST') || 'aws-1-eu-west-1.pooler.supabase.com';
  const direct =
    lireEnv('SUPABASE_DB_DIRECT') === '1' ? lireEnv('SUPABASE_DB_HOST') : '';
  return new Client({
    host: direct || hote,
    port,
    user: utilisateur,
    password: motDePasse,
    database: base,
    ssl: { rejectUnauthorized: false },
  });
}
