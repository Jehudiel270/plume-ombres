// ============================================================
// lib/supabase/service.ts — CLIENT SERVICE ROLE (serveur uniquement).
//
// Ce client utilise SUPABASE_SERVICE_ROLE_KEY : il contourne les
// politiques RLS. Il ne sert qu'à DEUX usages précis :
//   1. lire le réservoir de clés d'API (public.cles_api) pour que
//      les modules d'IA fonctionnent pour TOUS les abonnés — une
//      clé ne quitte jamais le serveur, donc ce contournement est
//      sûr : la sécurité repose sur le fait que cette clé vit
//      uniquement dans les variables d'environnement de l'hébergeur ;
//   2. mettre à jour les signaux de santé des clés (échecs de suite,
//      cooldown) — écritures automatiques sans session admin.
//
// Sans SUPABASE_SERVICE_ROLE_KEY, `creerClientService` renvoie null
// : le réservoir reste alors lisible SEULEMENT par une session
// administrateur (RLS) — l'aide à la lecture fonctionne pour l'admin
// qui essaie, et la variable d'environnement reste la voie
// officielle pour tous les abonnés.
// ============================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let clientEnCache: SupabaseClient | null | undefined;

/**
 * Client service role (partagé, paresseux) — ou null si la variable
 * d'environnement est absente. Jamais importé par le navigateur :
 * le fichier vit derrière des imports côté serveur uniquement.
 */
export function creerClientService(): SupabaseClient | null {
  if (clientEnCache !== undefined) return clientEnCache;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !cle) {
    clientEnCache = null;
    return null;
  }
  clientEnCache = createClient(url, cle, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return clientEnCache;
}

/** Usage exclusif des tests : oublie le client mis en cache. */
export function oublierClientService(): void {
  clientEnCache = undefined;
}
