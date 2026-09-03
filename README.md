# Plume d'Ombres — Traduction littéraire dark romance

Studio personnel (toi + tes amis) pour **importer, découper, traduire et
réassembler** des romans complets — jusqu'à ~1000 pages — dans un univers
visuel « dark romance ». Interface 100 % en français.

**Stack** : Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Supabase
(Auth + PostgreSQL, RLS par propriétaire) · moteurs de traduction
multi-fournisseurs (aucun fournisseur codé en dur).

---

## ✨ Fonctionnalités

- **Import** de livres `.txt` / `.md` (glisser-déposer) : détection
  automatique des chapitres (`Chapter`, `Chapitre`, `Prologue`…).
- **Découpage intelligent** : chaque ligne devient une unité ≤ 420 caractères
  (limite la plus stricte des fournisseurs) ; les paragraphes géants sont
  éclatés proprement aux fins de phrases.
- **Traduction multi-fournisseurs**, choisie côté serveur via
  `TRANSLATOR_DEFAULT` :
  - `libretranslate` (défaut) — moteur neuronal libre, gratuit & illimité,
    auto-hébergé (Docker ou natif). URL configurable (`LIBRETRANSLATE_URL`).
  - `mymemory` — API publique gratuite sans clé, en secours
    (~50 000 caractères/jour avec email).
- **File d'attente robuste** : statut par segment (en attente / en cours /
  fait / erreur), retry avec backoff exponentiel, annulation propre, reprise
  sans perte (la progression est persistée en base).
- **Assemblage 1:1 garanti** : les sauts de ligne et la structure des
  paragraphes sont conservés à l'identique (tous les retours à la ligne sont
  stockés séparément du texte traduit).
- **Export** `.md` du chapitre courant ou du livre entier (traduction si
  disponible, sinon texte source).
- **Comptes** email + mot de passe (Supabase Auth) ; chacun ne voit que ses
  livres (RLS).

---

## 🚀 Installation locale

Prérequis : Node.js ≥ 20, npm, un moteur Supabase (voir plus bas) et
éventuellement Docker pour LibreTranslate.

```bash
# 1. Dépendances
npm install

# 2. Variables d'environnement
cp .env.example .env.local
# → renseigne NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
#   (et LIBRETRANSLATE_URL si ton instance n'est pas sur le port 5000)

# 3. Base de données
# Les migrations SQL vivent dans supabase/migrations/.
# - Option A (recommandée) : Supabase local via Docker
#     npx supabase start          # URL : http://127.0.0.1:54321
#     npx supabase db reset       # applique les migrations
# - Option B : projet hébergé sur supabase.com → copie URL + clé anon
#     dans .env.local, puis applique le fichier SQL dans
#     « SQL Editor » (ou : npx supabase db push)

# 4. Moteur de traduction local (facultatif mais recommandé, gratuit)
docker run -d --name libretranslate -p 5000:5000 \
  -e LT_LOAD_ONLY=en,fr \
  --restart unless-stopped \
  libretranslate/libretranslate:latest
#   ⚠️ premier démarrage : téléchargement des modèles (~quelques minutes).
#   Ajoute d'autres langues dans LT_LOAD_ONLY (ex. en,fr,es,it,pt,de).

# 5. Lancement
npm run dev        # → http://localhost:3000
```

> Sans LibreTranslate sous la main, bascule sur MyMemory pour tester :
> `TRANSLATOR_DEFAULT=mymemory` dans `.env.local`.

### Tests automatisés (sans base de données)

```bash
npx tsx scripts/test-segmenter.ts   # intégrité du découpage/assemblage 1:1
npx tsx scripts/test-pipeline.ts    # import → découpage → traduction → assemblage
```

---

## ☁️ Déploiement en ligne (toi + tes amis)

L'application tourne sur **Vercel**, les données sur **Supabase**, et le
moteur de traduction gratuit sur une **VM Always Free Oracle Cloud**
(ou, à défaut, MyMemory sans clé).

### 1. Supabase (gratuit)

1. Crée un projet sur [supabase.com](https://supabase.com) (plan Free).
2. Dans **SQL Editor**, colle le contenu de
   `supabase/migrations/20260903000001_schema.sql` puis *Run*.
3. Récupère dans **Settings → API** : `Project URL` (NEXT_PUBLIC_SUPABASE_URL)
   et la clé `anon public` (NEXT_PUBLIC_SUPABASE_ANON_KEY).
4. **Authentication → Providers → Email** : désactive « Confirm email »
   (pour une utilisation entre amis sans boîte mail SMTP), ou configure un
   SMTP si tu veux la confirmation.

### 2. Moteur LibreTranslate — VM Always Free Oracle Cloud (gratuit à vie)

> Pourquoi pas Render ? Le plan gratuit de Render offre 512 Mo de RAM et
> efface le disque au spin-down : LibreTranslate (qui exige ~2 Go pour
> charger ses modèles) y est inutilisable. La VM Oracle Always Free
> (4 CPU ARM + 24 Go de RAM) est la solution *vraiment* gratuite et fiable.

1. Crée un compte [Oracle Cloud](https://www.oracle.com/cloud/free/) — une
   carte bancaire est demandée **uniquement pour la vérification**, aucun
   débit n'est effectué.
2. **Compute → Instances → Create instance** :
   - Image : **Ubuntu 22.04** (ou Oracle Linux)
   - Shape : **VM.Standard.A1.Flex** (ARM) — 4 OCPU / 24 Go de RAM
     (ressources Always Free ; si « out of capacity », change de région ou
     réessaie plus tard)
   - Télécharge une clé SSH publique.
3. Connecte-toi et installe Docker :
   ```bash
   sudo apt update && sudo apt install -y docker.io
   sudo systemctl enable --now docker
   sudo usermod -aG docker ubuntu
   ```
   (déconnecte-toi puis reconnecte-toi pour que le groupe prenne effet)
4. Lance LibreTranslate (ne charge que les langues utiles) :
   ```bash
   docker run -d --name libretranslate --restart unless-stopped \
     -p 5000:5000 \
     -e LT_LOAD_ONLY=en,fr \
     -e LT_REQ_LIMIT=60 \
     libretranslate/libretranslate:latest
   ```
5. Ouvre le **port 5000** dans **Networking → Security Lists** (entrée
   TCP 5000 depuis `0.0.0.0/0`).
6. Vérifie : `http://IP_DE_LA_VM:5000/languages`.

### 3. Vercel

1. Pousse ce dépôt sur GitHub/GitLab, puis **Import** sur
   [vercel.com/new](https://vercel.com/new) (framework détecté : Next.js).
2. **Settings → Environment Variables** :
   | Variable | Valeur |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clé anon Supabase |
   | `TRANSLATOR_DEFAULT` | `libretranslate` (ou `mymemory`) |
   | `LIBRETRANSLATE_URL` | `http://IP_DE_LA_VM:5000` |
   | `MYMEMORY_EMAIL` | (facultatif) ton email pour le quota MyMemory |
3. **Deploy**. ⚠️ Ajoute l'URL Vercel dans Supabase
   (**Authentication → URL Configuration**) comme *Site URL* / *Redirect*.
4. Note : sur Vercel, l'app ne peut pas joindre une instance LibreTranslate
   *locale* — si tu utilises `mymemory`, aucune VM n'est nécessaire.

---

## 📁 Architecture

```
app/
  api/translate/route.ts     # traduction d'un segment (session requise)
  connexion/                 # connexion / inscription
  bibliotheque/              # liste des livres + import
  livres/[id]/               # espace de travail d'un livre
components/
  BarreNavigation.tsx        # entête + déconnexion
  ZoneImport.tsx             # glisser-déposer .txt/.md
  BibliothequeClient.tsx     # grille des livres
  EspaceLivre.tsx            # chapitres, lecture, traduction, export
lib/
  segmenter.ts               # découpage / assemblage 1:1 (cœur)
  import-livre.ts            # préparation d'un livre importé
  useMoteurTraduction.ts     # file d'attente + retry + reprise
  providers/                 # interface + LibreTranslate + MyMemory
  supabase/                  # clients navigateur / serveur
supabase/migrations/         # schéma SQL (livres, chapitres, segments, RLS)
scripts/                     # tests sans base de données
```

---

## ⚠️ Limites connues

- **MyMemory** : ~50 000 caractères/jour (avec email) ; qualité moyenne.
  Vise un usage de secours, pas le volume.
- **LibreTranslate local** : la qualité est correcte mais inférieure à un
  LLM ; certaines tournures littéraires peuvent manquer de finesse. La
  traduction est **brute** (pas de relecture manuelle en v1).
- **Import** : `.txt`/`.md` en UTF-8 ; pas d'`.epub` ni de PDF en v1.
- **Découpage ligne à ligne** : la structure (paragraphes, lignes vides) est
  toujours préservée, mais une ligne à l'intérieur d'un paragraphe en
  « retour à la ligne automatique » est traduite comme unité propre.
- **1000 pages** : prévu et fluide (segments persistés, reprise totale) ;
  comptez ~1 à 4 h de traduction selon le moteur pour un très gros volume.

## 📜 Licence

Projet privé de Carrel DOSSOU — usage personnel et cercle d'amis.
