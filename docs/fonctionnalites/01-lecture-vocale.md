# Fiche module 2 — Lecture à voix haute (TTS)

Date : 12/11/2026 · Branche : `fonctionnalite/lecture-vocale` · Code : **F9** ·
Effort : S · Risque juridique : aucun (aucun contenu ne quitte l'appareil).

## Problème du lecteur

Lire longtemps sur écran fatigue ; relire un passage en écoutant aide à régler le
rythme et à relire sans les mains. La recherche du PDF de cadrage (F9, « Lecture
audio ») en fait une fonction d'abonnement : à l'ouverture, elle est proposée à tous
les comptes — l'administrateur peut ensuite la restreindre (plan minimal) sans
redéploiement, depuis l'interrupteur `lecture_vocale`.

## Choix techniques

- **Web Speech API du navigateur** (`window.speechSynthesis`) : zéro clé, zéro
  serveur, zéro coût par caractère, aucune donnée sortant de l'appareil. Limites
  assumées : la qualité de voix dépend de l'appareil, et le résumé IA vocal
  « Premium Plus » du PDF de cadrage reste une piste séparée (non développée ici).
- **Découpage typographique PARTAGÉ avec le rendu** : le texte lu passe par
  `decouperEnParagraphes` (lib/pagination.ts) — même segmentation que l'affichage,
  séparateurs de scène ignorés, paragraphe long re-découpé aux phrases avec limite
  prudente de 4 000 caractères par énoncé (les synthèses tronquent au-delà).
- **Voix** : françaises d'abord (fr-FR en tête), choix mémorisé localement
  (`plume-voix-vocale`), vitesse mémorisée (`plume-vitesse-vocale`, ×0,75 → ×1,5).
- **Suivi** : le paragraphe en cours reçoit un liseré (`data-lecture-vocale`) et est
  amené à l'écran ; compteur « n/total » annoncé en `aria-live`.
- **Changement de chapitre ou de vue** : la lecture s'arrête proprement
  (`speechSynthesis.cancel`), la position repart de zéro.

## Branchement dans le lecteur (ajouts minimals)

| Fichier | Changement |
|---|---|
| `lib/lecture-vocale.ts` (nouveau) | logique pure : découpage, choix de voix, tri, vitesses |
| `lib/lecture-vocale.test.ts` (nouveau) | 7 tests |
| `components/lecteur/LectureVocale.tsx` (nouveau) | composant client (Web Speech API) |
| `components/lecteur/Lecteur.tsx` | NOUVELLE prop facultative `outils?: ReactNode` rendue dans la barre du chapitre — le lecteur livré reste identique sans elle |
| `components/EspaceLivre.tsx` | nouvelle prop facultative `lectureVocaleOuverte` (défaut false) + rendu conditionnel de `<LectureVocale texte={texteNet} />` |
| `app/livres/[id]/page.tsx` | barrière fine serveur : `verifierAccesModule('lecture_vocale', { utilisateurId, codePlan })` — le composant n'est monté que si le module est ouvert |
| `app/globals.css` | règle additive du liseré du paragraphe lu |

Le serveur est l'autorité : l'interrupteur est évalué côté page (registre + plan
effectif du compte), pas seulement masqué dans l'interface.

## Patterns React respectés (règles du projet)

- Disponibilité et liste des voix : `useSyncExternalStore` (événement
  `voiceschanged`, instantanés cachés de module) — pas de `setState` synchrone
  dans un effet.
- Changement de texte : ajustement d'état PENDANT le rendu (pattern officiel),
  l'effet se réservant le `cancel()` de la synthèse.
- Chaînage des énoncés : fonction dans une ref (pas de TDZ, aucune dépendance).

## Tests et vérifications exécutés

- `npx tsx --test lib/lecture-vocale.test.ts` : **7/7** (découpage, limites par
  énoncé, séparateurs de scène, choix de voix avec préférence, tri des voix,
  normalisation des vitesses).
- `npm run test:unitaires` : 194/195 (le seul échec reste le test préexistant
  `admin-paiements` dépendant du fuseau du bac à sable).
- `npm run check:flags` : OK. `npm run build` : OK. `npm run lint` : revenu à l'état
  de base de `develop` (1 erreur + 1 avertissement préexistants, non touchés).

## Ce qui n'est pas vérifié ici

- Le rendu réel sur iOS Safari (le bouton de lecture est un geste utilisateur, ce que
  la plateforme exige, mais la qualité/durée des énoncés varie selon l'appareil) :
  à confirmer sur l'aperçu Vercel avec un appareil réel.
- Le module est livré fermé : rien n'apparaît tant que l'administrateur n'a pas
  ouvert `lecture_vocale` dans /admin/fonctionnalites (et la table d'états n'existe
  que si la migration du module 1 est appliquée — défaut = éteint).
