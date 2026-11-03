import { ImageResponse } from 'next/og';

// Image de partage (WhatsApp, Facebook, Telegram, X) : sans elle, un lien
// partagé n'affiche qu'une vignette grise. Générée par Next, aucune
// dépendance ajoutée, aucun fichier binaire à maintenir.
export const alt = 'Plume d’Ombres — traduction de dark romance, chapitre par chapitre';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
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
          <div style={{ color: '#b98b9c' }}>plume-ombres.vercel.app</div>
        </div>
      </div>
    ),
    size
  );
}
