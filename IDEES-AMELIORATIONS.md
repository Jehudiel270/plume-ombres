# IDEES-AMELIORATIONS — Plume d'Ombres

> Recherche produit (web, sources citées) pour un lecteur/traducteur **dark romance** francophone,
> Next 16 · React 19 · Supabase · PWA · export PDF/DOCX côté client · moteur LibreTranslate self-hosted.
> Contrainte : **100 % gratuit ou auto-hébergeable d'abord**, pas de gadget coûteux.
> Date : octobre 2026. Fichier en lecture seule côté roadmap (aucune modification d'autre fichier).

Constat de départ (état actuel du repo) : import `.txt/.md/.epub`, découpage par paragraphe,
traduction multi-fournisseurs (LibreTranslate local / Gemini free / MyMemory), file d'attente,
assemblage 1:1, export MD/PDF/DOCX, favoris, recherche, `lib/stats.ts` (temps de lecture + visites),
`lib/progression.ts` (reprise), sommaire. **Manquent** : TTS, bilingue aligné, glossaire, notes,
tags/content warnings, séries, sync cloud, offline complet.

## 20 idées concrètes

| Idée | Problème utilisateur résolu | Effort | Impact | Dépendances | Coût | URL source |
|---|---|---|---|---|---|---|
| 1. Lecture à voix haute (TTS) dans le lecteur via Web Speech API | Fatigue oculaire ; lire en marchant / en voiture | S | Fort | Navigateur (Web Speech API), 0 clé, 0 serveur | Gratuit | https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API |
| 2. TTS neuronal auto-hébergé (Piper) en fallback + export audio par chapitre | Voix moins robotiques que le TTS navigateur ; écouter hors-ligne | M | Fort | Serveur local `piper` (self-host, Docker/binaire) | Gratuit (self-host) | https://github.com/rhasspy/piper |
| 3. Mode bilingue aligné (paragraphe source ↔ traduction, tap = mot) | Vérifier la fidélité d'une traduction auto ; lire sans tout perdre | M | Fort | Client (Vercel/Netlify free) | Gratuit | https://immersivetranslate.com/en/docs/features/epub/ · https://readlang.com/features |
| 4. Glossaire perso / mémoire de traduction (noms, titres, termes) injecté dans les prompts | Noms et termes incohérents d'un chapitre à l'autre | M | Fort | Supabase free + LibreTranslate local | Gratuit | https://noveltranslator.com/ · https://novotranslator.com/ |
| 5. Glossaire auto-suggéré (extraction des entités récurrentes du livre) | L'utilisateur ne sait pas quoi mettre dans le glossaire | M | Moyen | Supabase free + traitement local | Gratuit | https://noveltranslator.com/ |
| 6. Surlignage + notes attachées, format d'annotation Readium (export JSON portable) | Perdre les passages marquants ; impossible de les retrouver | M | Fort | Client + Supabase free | Gratuit | https://github.com/readium/annotations |
| 7. Récap auto du chapitre + bandeau « Où j'en étais » | Reprendre une longue série après une pause, se remémorer l'intrigue | S | Fort | Moteur IA gratuit (Gemini free) ou résumé local | Gratuit | https://github.com/Seismix/royalrefresh |
| 8. Stats de lecture enrichies : jours consécutifs (streak), objectif, temps restant | Motivation, sentiment de progression, attachement | S | Moyen | Local (localStorage ; base `lib/stats.ts` déjà là) | Gratuit | https://www.lingq.com/blog/introducing-lingq-5-0/ |
| 9. Suivi de séries + notification push « nouveau chapitre traduit » | Savoir quand reprendre un tome ; ne pas polluer le quotidien | M | Fort | Supabase free + `web-push` auto-hébergé (VAPID) | Gratuit | https://www.npmjs.com/package/web-push · https://archiveofourown.org/faq/subscriptions-and-feeds?language_id=en |
| 10. Content warnings + classification d'âge par livre/chapitre (tags type AO3) | Éviter un contenu non désiré ; préparer psychologiquement un tome | S | Fort | Supabase free | Gratuit | https://archiveofourown.org/faq/tags?language_id=en · https://booktriggerwarnings.com/Welcome |
| 11. Tropes + filtre « humeur »/niveau de piment (spice) par livre | Choisir la prochaine lecture selon l'envie réelle | M | Moyen | Supabase free | Gratuit | https://moodreads.app/about · https://alternativeto.net/software/emberreads/about/ |
| 12. Sync cloud inter-appareils de la progression et des marque-pages | Commencer sur mobile, continuer sur desktop | M | Fort | Supabase free (aujourd'hui localStorage) | Gratuit | https://supabase.com/pricing |
| 13. Lecture hors-ligne complète d'un livre traduit (service worker, pré-téléchargement) | Lire dans le métro / en avion sans réseau | M | Fort | Vercel/Netlify free + `next-pwa` (déjà installé) | Gratuit | https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps |
| 14. Cible de partage PWA (`share_target`) : « Partager vers Plume d'Ombres » → import | Import laborieux d'un EPUB/PDF reçu sur mobile | S | Moyen | Vercel/Netlify free + manifest PWA | Gratuit | https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/share_target |
| 15. Carte-citation à partager (image citation, esthétique dark) | Partager un coup de cœur sans spoiler | S | Fort (acquisition) | Client (canvas), hébergement free | Gratuit | https://support.wattpad.com/hc/en-us/articles/47083300280596-Social-Feed-FAQ |
| 16. Mode confort / accessibilité (police dyslexie, AMOLED, interligne, contraste) | Confort mobile, lisibilité, longues sessions | S | Moyen | Client | Gratuit | https://www.lingq.com/en/ios-app-support/ · https://www.edrlab.org/software/thorium-reader/ |
| 17. Recherche bilingue plein texte (chercher en FR trouve le passage EN et inversement) | Retrouver un passage clé dont on ne se rappelle que d'un mot | M | Moyen | Supabase free (index full-text) | Gratuit | https://supabase.com/pricing |
| 18. Import depuis une URL de chapitre web (Royal Road / Wattpad) → EPUB | Lire des webnovels en local sans copier-coller | M | Moyen (gadget si mal cadré) | Vercel free (fetch serverless) | Gratuit | https://www.opennovel.co/ |
| 19. Bibliothèque communautaire **opt-in** de traductions/glossaires partagés par lien | Refaire la traduction des mêmes livres populaires, chacun dans son coin | L | Fort (différenciant) | Supabase free + RLS | Gratuit | https://archiveofourown.org/faq/bookmarks?language_id=en&view_adult=true |
| 20. Soutien à l'auteur : liens directs tip jar (Ko-fi/Payhip/BookFunnel), sans paywall des traductions | Gratuité durable + respect du droit d'auteur ; soutenir la plume | S | Moyen | Liens externes, hébergement free (0 commission app) | Gratuit pour Plume | https://authors.bookfunnel.com/help/delivery-actions/ · https://creator-payout-calc.hdg-os.workers.dev/ |

### Notes de faisabilité (sources)

- **TTS navigateur = gratuit et sans backend.** Le Web Speech API (synthèse) est natif ; des PWA
  open-source le font déjà avec **surlignage synchronisé et support hors-ligne** — un modèle direct
  pour Plume : https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API ·
  https://github.com/Ayush12358/WebTTS · https://github.com/roy2100/readbook
- **Piper (voix neuronales locales)** : dépôt `rhasspy/piper` **archivé le 6 octobre 2025** mais
  toujours utilisable/forks actifs ; Coqui TTS comme alternative : https://github.com/coqui-ai/tts
- **Détail : HTML5 speech synthesis** = synthèse en navigateur, sans clé API, donnée jamais envoyée
  au serveur — cohérent avec l'exigence « gratuit, self-hosted d'abord » (cf. quick-tts, 100 % local) :
  https://quick-tts.com/blog/epub-to-speech-free.html
- **Push web auto-hébergé** : protocole Web Push + VAPID, bibliothèque Node `web-push`, aucun service
  tiers payant : https://web.dev/articles/sending-messages-with-web-push-libraries
- **Supabase free** : 500 Mo DB, 50 000 utilisateurs actifs/mois, 5 Go egress, 1 Go stockage —
  projet mis en pause après ~1 semaine d'inactivité : https://supabase.com/pricing
- **LibreTranslate** : 100 % self-hosted, hors-ligne, sans dépendance Google/Azure :
  https://github.com/LibreTranslate/LibreTranslate
- **Ce qui existe déjà bien chez les concurrents** (pour éviter de réinventer sans valeur ajoutée) :
  Immersive Translate fait le bilingue EPUB + « Create Bilingual Epub » et un PDF Pro
  (https://immersivetranslate.com/en/document/epub-translator/ · https://app.immersivetranslate.com/pdf-pro/) ;
  Readlang fait le clic-pour-traduire contextuel + flashcards SRS (https://blog.readlang.com/2024/12/04/context-aware-translations-and-two-other-features.html) ;
  LingQ fait le mode phrase + audio + vocabulaire (https://forum.lingq.com/t/sentence-mode-how-why-to-use-it/8735).
  Le créneau de Plume : **ces qualités, mais sur MES EPUB/PDF, en PWA française, en local, gratuitement.**
- **Risque de concentration** : Kindle Translate reste une **bêta sur invitation**, 6 langues
  seulement (https://www.aboutamazon.com/news/books-and-authors/amazon-kindle-translate-books-authors) ;
  la demande d'import perso ne disparaît pas.

---

## TOP 8 vague 2

1. **TTS lecture à voix haute (S)** — effort minime, aucune dépendance payante, gain d'usage immédiat.
2. **Mode bilingue aligné (M)** — c'est LE différenciateur de confiance face à une traduction auto.
3. **Glossaire perso / mémoire de traduction (M)** — corrige le défaut n°1 des traductions automatiques (noms incohérents).
4. **Surlignage + notes exportables (format Readium) (M)** — rétention « mes passages », et interopérable, pas propriétaire.
5. **Content warnings + classification d'âge (S)** — attendu explicitement par le public dark romance (AO3/BTW comme preuve de besoin).
6. **Stats + streak de lecture (S)** — motivation et habitude, et `lib/stats.ts` fournit déjà la base.
7. **Offline complet du livre traduit (M)** — rend le « mobile réel » crédible (métro/avion), `next-pwa` déjà installé.
8. **Suivi de séries + push self-hosted (M)** — ramène l'utilisateur au bon moment, sans service payant.

Critère de tri : on prend ce qui est **gratuit/auto-hébergeable**, à effort S ou M, et à impact direct
sur la lecture (pas la décoration).

## Idées différenciantes (personne ne les fait bien)

- **A. Bibliothèque communautaire opt-in de traductions/glossaires partagés (idée 19).**
  AO3/Wattpad ont le social **mais pas** la traduction privée d'EPUB perso ; Immersive Translate et
  Novel Translator ont la traduction **mais pas** de communauté ni de lecteur PWA FR partagé. Personne
  n'unit les deux : « je traduis mon EPUB une fois, mes amis en héritent avec le même glossaire ».
- **B. Mode bilingue aligné + glossaire auto, appliqués à des livres personnels (idées 3+4+5).**
  L'apprentissage porte sur des tonnes de lecture (souvent épais) ; les outils grand public gèrent le
  clic-pour-traduire web, pas la mémoire terminologique d'un roman dark romance importé.
- **C. TTS + export audio FR, 100 % local/self-hosted (idées 1+2).**
  Readlang facture le stockage audio (volet payant) ; Plume peut offrir « écouter mon roman traduit »
  sans clé ni cloud payant, ce qui reste rare et aligné avec l'exigence de gratuité.

## Blocages / limites de cette recherche

- Certaines requêtes (LingQ détaillé, caniuse Web Speech, StoryGraph) ont renvoyé des pages vides au
  moment de la collecte ; les affirmations associées s'appuient sur des pages officielles ou de presse
  alternatives, pas sur ces fiches-là.
- Le support exact de `speechSynthesis` sur iOS Safari n'a pas pu être confirmé par une source de
  compatibilité live : à vérifier avant de promettre le TTS sur iPhone.
- L'idée 20 doit rester **hors** de tout paywall de traduction (risque juridique) : elle ne concerne
  que des liens de soutien externes.
