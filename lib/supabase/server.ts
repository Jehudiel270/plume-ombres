// Client Supabase côté serveur (composants serveur, routes API).
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Client Supabase lié aux cookies de la requête courante.
 * Utilisable uniquement dans les composants serveur / route handlers.
 */
export async function creerClientServeur() {
  const stockageCookies = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return stockageCookies.getAll();
        },
        setAll(cookiesAAjouter) {
          try {
            cookiesAAjouter.forEach(({ name, value, options }) =>
              stockageCookies.set(name, value, options)
            );
          } catch {
            // Hors d'un contexte de rendu (ex. build), la mise à jour
            // des cookies est ignorée : c'est le proxy qui s'en charge.
          }
        },
      },
    }
  );
}

/** Renvoie l'utilisateur connecté, ou null. */
export async function utilisateurConnecte() {
  const supabase = await creerClientServeur();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
