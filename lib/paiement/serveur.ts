// ============================================================
// lib/paiement/serveur.ts — Aides serveur des routes de paiement.
//
// Isole la création des clients Supabase (cookies de la requête,
// ou service_role pour le webhook en mode réel) afin que les routes
// restent lisibles. Aucune clé n'est exposée au navigateur.
// ============================================================

import { createServerClient } from '@supabase/ssr';
import {
  createClient,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';

/** Client Supabase lié aux cookies de la requête entrante. */
export function clientRequete(request: NextRequest): SupabaseClient {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: () => {
          /* lecture seule : la session est déjà posée par le proxy */
        },
      },
    }
  );
}

/** Utilisateur authentifié (session par cookies ou jeton Bearer). */
export async function utilisateurRequete(
  request: NextRequest
): Promise<{ supabase: SupabaseClient; user: User | null }> {
  const supabase = clientRequete(request);
  const porteur = request.headers.get('authorization');
  const {
    data: { user },
  } = porteur?.startsWith('Bearer ')
    ? await supabase.auth.getUser(porteur.slice('Bearer '.length))
    : await supabase.auth.getUser();
  return { supabase, user };
}

/**
 * Client service_role (webhook en mode réel : appel serveur-à-serveur,
 * sans session utilisateur). Renvoie null si la clé n'est pas fournie.
 */
export function clientServiceRole(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle) return null;
  return createClient(url, cle, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Origine publique du site (pour construire les URL de retour). */
export function origineSite(request: NextRequest): string {
  const configuree = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configuree) return configuree.replace(/\/$/, '');
  return request.nextUrl.origin;
}
