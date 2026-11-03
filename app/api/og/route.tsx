import { ImageResponse } from 'next/og';

// ============================================================
// Image de partage — /api/og?v=2
//
// Anciennement app/opengraph-image.tsx : Next choisissait lui-même l'URL
// suffixée d'un identifiant de build. Les robots (WhatsApp, Facebook,
// Telegram) gardaient l'ancienne vignette, avec l'ancien domaine gravé
// dedans, sans jamais re-télécharger. Une route dédiée donne une URL
// maîtrisée : pour rafraîchir tous les aperçus, on incrémente VERSION.
// ============================================================

// Sur une route, seuls GET/POST/… et quelques clés de config sont exportables :
// la version reste donc une constante locale. Pour rafraîchir les aperçus,
// l'incrémenter ICI et dans l'URL déclarée par app/layout.tsx.
const VERSION = '2';

const HOTE = (() => {
  const brut = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!brut) return 'plumedombres.kodelyza.com';
  try {
    return new URL(brut).host;
  } catch {
    return 'plumedombres.kodelyza.com';
  }
})();

export async function GET() {
  const image = new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: 'linear-gradient(135deg, #12060d 0%, #2a0d1b 55%, #4a1024 100%)',
          color: '#f7e9ef',
          fontFamily: 'Georgia, serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            fontSize: 26,
            letterSpacing: 6,
            textTransform: 'uppercase',
            color: '#e7a6bd',
          }}
        >
          <div style={{ width: 54, height: 2, background: '#e7a6bd' }} />
          Plume d’Ombres
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ fontSize: 74, lineHeight: 1.1, fontWeight: 700, maxWidth: 980 }}>
            Traduisez vos dark romances, chapitre par chapitre
          </div>
          <div style={{ fontSize: 32, lineHeight: 1.35, color: '#d9b9c6', maxWidth: 900 }}>
            Import .epub, .pdf, .docx · découpage fidèle · traduction anglais → français · lecteur
            confortable
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 28, fontSize: 26, color: '#f2cdd9' }}>
          <div
            style={{
              display: 'flex',
              padding: '14px 30px',
              borderRadius: 999,
              background: '#e7a6bd',
              color: '#210712',
              fontWeight: 700,
            }}
          >
            Essai gratuit au lancement
          </div>
          <div style={{ color: '#b98b9c' }}>{HOTE}</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );

  return new Response(image.body, {
    headers: {
      'Content-Type': 'image/png',
      // Un jour de cache : assez pour ne pas recalculer à chaque partage,
      // assez court pour qu'un changement de visuel se propage vite.
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      // Rend visible, d'un simple curl, quelle version est réellement servie.
      'X-Og-Version': VERSION,
    },
  });
}
