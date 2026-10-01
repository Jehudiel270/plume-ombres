// Layout des pages PUBLIQUES (groupe de routes `(public)`, sans effet
// sur l'URL) : accueil, tarifs, FAQ, contact et pages légales.
// Le fond d'ambiance WebGL et les polices viennent du layout racine ;
// ici, seulement la barre de navigation et le pied de page publics.

import NavPublique from '@/components/public/NavPublique';
import PiedPublique from '@/components/public/PiedPublique';

export default function LayoutPublic({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen flex flex-col">
      <NavPublique />
      <div className="flex-1">{children}</div>
      <PiedPublique />
    </div>
  );
}
