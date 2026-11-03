// Page cliente : l'export metadata est interdit ici, d'où ce layout.
import { prive } from '@/lib/metadata';

export const metadata = prive('Nouveau mot de passe');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
