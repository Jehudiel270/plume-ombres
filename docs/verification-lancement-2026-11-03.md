# Feu vert publicité — 3 novembre 2026

## Verdict

**Oui, tu peux lancer la publicité.** Le parcours d'un visiteur venu d'une pub
a été rejoué en entier sur le site de production, avec un vrai compte :

```bash
node --env-file=.env.local scripts/verifier-inscription.mjs   # 12/12, TOUT EST VERT
node --env-file=.env.local scripts/verifier-sections-e2e.mjs  # 14/14
```

## Quatre défauts corrigés pour ce feu vert

| Défaut | Conséquence sans correctif | Correctif |
| --- | --- | --- |
| Aucun profil créé à l'inscription (le profil dépendait d'un `upsert` de la page de connexion) | un compte venu d'une pub restait sans pseudo ; c'est aussi ce qui rendait `mes_sections()` ambigu | déclencheur `profil_auto_inscription` + rattrapage des comptes existants |
| Aucune image de partage (`og:image`) | lien partagé sur WhatsApp/Facebook = vignette vide | `app/opengraph-image.tsx` (1200×630, générée par Next, zéro dépendance) |
| Cette image renvoyait **307 vers /connexion** | les robots de Facebook et WhatsApp recevaient une page de connexion | exclusion `opengraph-image`/`twitter-image`/`apple-icon` dans le proxy |
| `/robots.txt` et `/sitemap.xml` protégés par le proxy | aucun repérage des pages publiques, vérification Facebook Ads impossible | `app/robots.ts` + `app/sitemap.ts` (9 pages publiques, espaces privés exclus) |

## Ce qui est vérifié en production

- Accueil, tarifs, conditions, confidentialité, cookies, mentions légales, remboursement, FAQ, contact : **200** sans être connecté.
- Espaces privés (`/bibliotheque`, `/compte`, `/favoris`, `/admin`) : redirection ou **401**.
- Inscription : **200 en ~1,3 s**, compte actif immédiatement (pas de blocage par e-mail).
- Essai de lancement : plan `essai`, statut `actif`, fin **J+7** attribués automatiquement.
- `og:image` : **200 image/png, 102 Ko, 1200 px**, accents corrects.
- En-têtes : CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- `tsc` 0 · `eslint` 0 · **162/162 tests** · build webpack vert.

## Trois points à surveiller pendant la campagne

1. **Capacité de traduction** : la chaîne LibreTranslate → Gemini → Google → MyMemory
   encaisse une panne, pas un pic massif. Surveille les erreurs 429 dans les
   premières 48 h ; si ça sature, on ajoute un second execucuteur auto-hébergé.
2. **Aucune alerte automatique** : si un paiement échoue la nuit, personne ne le
   sait. Un cron de contrôle (transaction de référence + `/api/statut`) est la
   prochaine brique à poser.
3. **Essai gratuit** : un essai par compte, pas par personne. Sans vérification
   d'e-mail, quelques curieux pourront multiplier les comptes pour rejouer
   l'essai. À mesurer sur les premières semaines avant de brider.
