import { existsSync } from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';

// ------------------------------------------------------------
// Turbopack refuse de résoudre un `node_modules` situé HORS de la racine
// du projet. C'est exactement notre cas : les worktrees git partagent un
// seul `node_modules` (jonction NTFS vers `dark-romance-integration/`),
// situé dans le dossier PARENT du projet.
//
// La documentation Next prescrit alors `turbopack.root` = dossier parent
// du projet ET des dépendances liées :
//   node_modules/next/dist/docs/01-app/03-api-reference/05-config/
//     01-next-config-js/turbopack.md  → section « Root directory »
//
// On ne l'active QUE si ce dossier parent contient réellement le
// node_modules partagé. En production (Vercel), la condition est fausse :
// la configuration reste celle par défaut, sans élargir le périmètre de
// fichiers surveillés ni l'empreinte du build.
const dossierParent = path.resolve(process.cwd(), '..');
const racinePartagee = existsSync(
  path.join(dossierParent, 'dark-romance-integration', 'node_modules')
)
  ? dossierParent
  : null;

const nextConfig: NextConfig = {
  ...(racinePartagee ? { turbopack: { root: racinePartagee } } : {}),
};

export default nextConfig;
