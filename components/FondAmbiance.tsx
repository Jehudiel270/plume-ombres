'use client';

// ============================================================
// FondAmbiance.tsx — « la nuit vivante » en WebGL 1 natif.
//
// Signature immersive Plume d'Ombres :
//   · deux couches de brume en dérive lente,
//   · des braises (étincelles de chandelle) qui montent,
//   · vignette qui resserre l'obscurité, grain fin anti-banding.
//
// Le shader est PILOTÉ PAR LA PALETTE choisie (uniforms `uBase`,
// `uLueurA/B`, `uBrumes`, `uBraises`, `uEnergie`, `uVignette`…) :
// changer de palette change l'atmosphère sans réinitialiser WebGL.
//
// REPLI AUTOMATIQUE sur image fixe (palette-aware, sans WebGL) si :
//   · prefers-reduced-motion,
//   · navigator.connection.saveData ou réseau « 2g »,
//   · batterie faible (déchargée, ≤ 20 %),
//   · ou WebGL indisponible.
//
// Coût maîtrisé : DPR ≤ 1.25, plafond ~30 img/s, pause complète
// quand l'onglet est masqué, powerPreference « low-power ».
// 0 dépendance, 0 requête réseau, 0 télémétrie.
// ============================================================

import { useEffect, useRef } from 'react';
import { useTheme } from '@/components/ProviderTheme';
import { PALETTES, type PaletteWebgl } from '@/lib/theme';

const VERTEX_SRC = `
attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAGMENT_SRC = `
precision mediump float;

uniform vec2  uRes;
uniform float uTime;
uniform vec3  uBase;
uniform vec3  uLueurA;
uniform vec3  uLueurB;
uniform vec3  uBrumeA;
uniform vec3  uBrumeB;
uniform vec3  uBraiseA;
uniform vec3  uBraiseB;
uniform float uEnergie;
uniform float uBraise;
uniform float uVignette;
uniform float uGrain;

/* --- Hash 2D -> 1D déterministe --- */
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

/* --- Bruit de valeur (interpolation quintique : C1, pas de blocs) --- */
float vn(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

/* --- FBM : 4 octaves, octaves pivotées pour casser l'alignement --- */
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vn(p);
    p = mat2(0.80, 0.60, -0.60, 0.80) * p * 2.03 + vec2(17.3, 9.1);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2  uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec2  p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime;

  /* Base : couleur de fond de la palette */
  vec3 col = uBase;

  /* Lueurs fixes adoucies, haut-gauche / haut-droite */
  col += uLueurA * 0.17 * uEnergie
       * smoothstep(1.3, -0.6, length(p - vec2(-0.55, 0.75)));
  col += uLueurB * 0.11 * uEnergie
       * smoothstep(1.2, -0.6, length(p - vec2(0.75, 0.55)));

  /* Brume : deux couches de FBM qui dérivent en sens contraires */
  float f1 = fbm(vec2(p.x * 1.5 + t * 0.022, p.y * 2.1 - t * 0.014));
  float f2 = fbm(vec2(p.x * 2.6 - t * 0.017 + 41.0, p.y * 3.2 + t * 0.021 + 17.0));
  float brume = f1 * 0.62 + f2 * 0.38;
  brume = smoothstep(0.30, 0.88, brume);
  vec3 teinte = mix(uBrumeA, uBrumeB, 0.5 + 0.5 * sin(p.x * 0.9 + f1 * 2.6));
  col = mix(col, col + teinte * 0.42 * uEnergie,
    brume * 0.46 * (1.0 - 0.40 * smoothstep(0.2, 1.25, length(p))));

  /* Braises : étincelles réparties sur une grille 2D JITTERÉE
     (colonnes + rangées), donc AUCUNE structure alignée par colonne
     — c'était la source de bandes verticales. Le halo décroît en
     gaussienne : quasi nul au-delà de ~0.2 écran, d'où aucune bande
     sur un fond très sombre où le moindre ajout se voit. */
  float nCols = 8.0;
  float cid = floor(uv.x * nCols);
  vec3  braise = vec3(0.0);
  for (int k = 0; k < 2; k++) {
    float kf = float(k);
    float h1 = hash21(vec2(cid + kf * 53.0, 3.1));
    float h2 = hash21(vec2(cid + kf * 53.0, 8.7));
    float h3 = hash21(vec2(cid + kf * 53.0, 1.3));

    float speed  = 0.05 + h2 * 0.09;
    float period = 1.7 / speed;
    float life   = fract(t / period + h3);

    float ey = -0.25 + life * 1.7;
    float ex = (cid + 0.15 + h1 * 0.7) / nCols;
    vec2  ep = vec2((ex - 0.5) * aspect, ey - 0.5);
    float d  = length(p - ep);

    float fade   = smoothstep(0.0, 0.12, life) * (1.0 - smoothstep(0.55, 1.0, life));
    float scint  = 0.6 + 0.4 * sin(t * (1.5 + h2 * 2.4) + h1 * 43.0);
    vec3  colB   = mix(uBraiseA, uBraiseB, h1);
    float halo   = exp(-d * d * 150.0);

    braise += colB * (fade * scint * halo * 0.26);
    braise += colB * (fade * scint * smoothstep(0.018, 0.003, d) * 0.65);
  }
  col += braise * uBraise;

  /* Vignette : pondérée par la palette (douce en thème clair) */
  col *= mix(1.0, 0.58 + 0.42 * smoothstep(1.25, 0.2, length(p * vec2(0.82, 1.0))),
             uVignette);

  /* Grain fin : casse le banding des zones sombres */
  col += (hash21(gl_FragCoord.xy + fract(t) * 61.7) - 0.5) * uGrain;

  gl_FragColor = vec4(col, 1.0);
}
`;

/** Compile+lie un shader ; lève en cas d'erreur (logger côté console). */
function compilerShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('createShader a échoué');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader non compilé : ${info}`);
  }
  return shader;
}

const uniform3 = (gl: WebGLRenderingContext, l: WebGLUniformLocation | null, c: readonly number[]) =>
  gl.uniform3f(l, c[0] ?? 0, c[1] ?? 0, c[2] ?? 0);

/** Décide s'il faut animer ou se rabattre sur une image fixe. */
async function modeAffichage(): Promise<'anime' | 'fixe'> {
  const reduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduit) return 'fixe';

  const conn = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  if (conn?.saveData === true) return 'fixe';
  if (conn?.effectiveType && /(^|-)2g$/.test(conn.effectiveType)) return 'fixe';

  // Batterie : l'API est non standard — on l'utilise si présente.
  const nav = navigator as Navigator & {
    getBattery?: () => Promise<{ charging: boolean; level: number }>;
  };
  if (typeof nav.getBattery === 'function') {
    try {
      const b = await nav.getBattery();
      if (!b.charging && b.level <= 0.2) return 'fixe';
    } catch {
      /* refus : on continue en animé */
    }
  }
  return 'anime';
}

export default function FondAmbiance() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { palette } = useTheme();
  // La boucle lit la palette courante sans relancer l'effet WebGL.
  const webglRef = useRef<PaletteWebgl>(PALETTES[palette].webgl);
  webglRef.current = PALETTES[palette].webgl;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const racine = document.documentElement;
    let annule = false;
    let nettoyer: (() => void) | null = null;

    const basculerFixe = () => {
      racine.dataset.fond = 'fixe';
      canvas.style.display = 'none';
    };

    const demarrer = () => {
      if (annule) return;
      const gl = canvas.getContext('webgl', {
        antialias: false,
        alpha: false,
        powerPreference: 'low-power',
      });
      // Pas de WebGL ? On bascule sur l'image fixe.
      if (!gl) {
        basculerFixe();
        return;
      }

      let programme: WebGLProgram | null = null;
      try {
        const vs = compilerShader(gl, gl.VERTEX_SHADER, VERTEX_SRC);
        const fs = compilerShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC);
        programme = gl.createProgram();
        if (!programme) throw new Error('createProgram a échoué');
        gl.attachShader(programme, vs);
        gl.attachShader(programme, fs);
        gl.linkProgram(programme);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        if (!gl.getProgramParameter(programme, gl.LINK_STATUS)) {
          throw new Error(`Programme non lié : ${gl.getProgramInfoLog(programme)}`);
        }
      } catch (e) {
        console.error('[FondAmbiance]', e);
        basculerFixe();
        return;
      }

      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 3, -1, -1, 3]),
        gl.STATIC_DRAW,
      );
      gl.useProgram(programme);
      const posLoc = gl.getAttribLocation(programme, 'aPos');
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

      const u = (nom: string) => gl.getUniformLocation(programme!, nom);
      const uRes = u('uRes');
      const uTime = u('uTime');
      const uBase = u('uBase');
      const uLueurA = u('uLueurA');
      const uLueurB = u('uLueurB');
      const uBrumeA = u('uBrumeA');
      const uBrumeB = u('uBrumeB');
      const uBraiseA = u('uBraiseA');
      const uBraiseB = u('uBraiseB');
      const uEnergie = u('uEnergie');
      const uBraise = u('uBraise');
      const uVignette = u('uVignette');
      const uGrain = u('uGrain');

      // DPR plafonné : le fond n'a pas besoin de la netteté 2x.
      const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
      let visible = true;

      const redimensionner = () => {
        const largeur = Math.max(1, Math.floor(canvas.clientWidth * dpr));
        const hauteur = Math.max(1, Math.floor(canvas.clientHeight * dpr));
        if (canvas.width !== largeur || canvas.height !== hauteur) {
          canvas.width = largeur;
          canvas.height = hauteur;
        }
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(uRes, canvas.width, canvas.height);
      };

      const appliquerPalette = () => {
        const w = webglRef.current;
        uniform3(gl, uBase, w.base);
        uniform3(gl, uLueurA, w.lueurA);
        uniform3(gl, uLueurB, w.lueurB);
        uniform3(gl, uBrumeA, w.brumeA);
        uniform3(gl, uBrumeB, w.brumeB);
        uniform3(gl, uBraiseA, w.braiseA);
        uniform3(gl, uBraiseB, w.braiseB);
        gl.uniform1f(uEnergie, w.energie);
        gl.uniform1f(uBraise, w.braise);
        gl.uniform1f(uVignette, w.vignette);
        gl.uniform1f(uGrain, w.grain);
      };

      const dessiner = (tempsSec: number) => {
        appliquerPalette();
        gl.uniform1f(uTime, tempsSec);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      };

      const INTERVALLE_CIBLE = 1000 / 30; // plafond ~30 img/s (CPU/GPU)
      let raf = 0;
      let depart = performance.now();
      let dernierDessin = -Infinity;

      const boucle = (maintenant: number) => {
        if (!visible) return;
        if (maintenant - dernierDessin >= INTERVALLE_CIBLE - 1) {
          dessiner((maintenant - depart) / 1000);
          dernierDessin = maintenant;
        }
        raf = requestAnimationFrame(boucle);
      };

      redimensionner();
      dessiner(0);
      racine.dataset.fond = 'anime';
      raf = requestAnimationFrame(boucle);

      // Pause/reprise quand l'onglet est masqué (batterie)
      const surVisibilite = () => {
        visible = !document.hidden;
        if (visible) {
          depart = performance.now();
          dernierDessin = -Infinity;
          raf = requestAnimationFrame(boucle);
        } else {
          cancelAnimationFrame(raf);
        }
      };
      document.addEventListener('visibilitychange', surVisibilite);
      window.addEventListener('resize', redimensionner);

      nettoyer = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', redimensionner);
        document.removeEventListener('visibilitychange', surVisibilite);
        gl.deleteBuffer(buffer);
        gl.deleteProgram(programme);
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      };
    };

    void modeAffichage().then((mode) => {
      if (annule) return;
      if (mode === 'fixe') basculerFixe();
      else demarrer();
    });

    return () => {
      annule = true;
      nettoyer?.();
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} aria-hidden="true" className="fond-ambiance" />
      {/* Image fixe de repli (palette-aware, sans WebGL) */}
      <div aria-hidden="true" className="fond-fixe" />
    </>
  );
}
