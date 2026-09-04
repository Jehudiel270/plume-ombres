'use client';

// ============================================================
// FondAmbiance.tsx — « la nuit vivante » en WebGL 1 natif.
//
// Signature immersive Plume d'Ombres :
//   · deux couches de brume bordeaux/plum en dérive lente,
//   · des braises (étincelles de chandelle) qui montent et scintillent,
//   · vignette qui resserre l'obscurité sur les bords,
//   · grain fin qui casse le banding des dégradés.
//
// Contraintes respectées :
//   · 0 dépendance, 0 requête réseau, 0 télémétrie,
//   · canvas fixe derrière tout le contenu (pointer-events:none),
//   · statique (1 frame) si prefers-reduced-motion,
//   · pause du loop quand l'onglet est masqué,
//   · DPR plafonné à 1.5 pour tenir les 60 fps,
//   · si WebGL échoue, le canvas disparaît et le dégradé CSS
//     du <body> reste comme fond de repli.
// ============================================================

import { useEffect, useRef } from 'react';

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

/* --- Hash 2D -> 1D déterministe --- */
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

/* --- Bruit de valeur (lissé) --- */
float vn(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

/* --- FBM : 4 octaves, suffisant pour de la brume douce --- */
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vn(p);
    p = p * 2.03 + vec2(17.3, 9.1);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2  uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  // Coordonnées centrées, l'axe Y en « hauteur d'écran » (indépendantes du format)
  vec2  p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime;

  /* Base : nuit chaude (charlot #0a0608) */
  vec3 col = vec3(0.039, 0.024, 0.031);

  /* Lueurs fixes adoucies — écho du dégradé CSS du body :
     bordeaux en haut à gauche, plum en haut à droite. */
  col += vec3(0.42, 0.118, 0.176) * 0.17
       * smoothstep(1.3, -0.6, length(p - vec2(-0.55, 0.75)));
  col += vec3(0.40, 0.227, 0.576) * 0.11
       * smoothstep(1.2, -0.6, length(p - vec2(0.75, 0.55)));

  /* Brume : deux couches de FBM qui dérivent en sens contraires */
  float f1 = fbm(vec2(p.x * 1.5 + t * 0.022, p.y * 2.1 - t * 0.014));
  float f2 = fbm(vec2(p.x * 2.6 - t * 0.017 + 41.0, p.y * 3.2 + t * 0.021 + 17.0));
  float brume = f1 * 0.62 + f2 * 0.38;
  brume = smoothstep(0.30, 0.88, brume);
  vec3 teinte = mix(
    vec3(0.42, 0.118, 0.176),   // bordeaux vieilli
    vec3(0.40, 0.227, 0.576),   // plum
    0.5 + 0.5 * sin(p.x * 0.9 + f1 * 2.6)
  );
  col = mix(col, col + teinte * 0.30,
    brume * 0.34 * (1.0 - 0.45 * smoothstep(0.2, 1.25, length(p))));

  /* Braises : une étincelle qui monte par colonne d'écran.
     Chaque colonne a sa vitesse, sa phase, son va-et-vient. */
  float nCols = 13.0;
  float colId = floor(uv.x * nCols);
  float hc  = hash21(vec2(colId, 0.11));
  float hc2 = hash21(vec2(colId, 4.77));
  float hc3 = hash21(vec2(colId, 9.31));

  float speed  = 0.055 + hc2 * 0.085;      // unités p / seconde
  float travel = 1.5;                       // de -0.2 (bas) à 1.3 (au-dessus du haut)
  float period = travel / speed;
  float life   = fract((t + hc3 * period) / period);

  float ey = -0.2 + life * travel + 0.018 * sin(t * 0.8 + hc * 21.0);
  float ex = (colId + 0.5 + (hc - 0.5) * 0.9
              + 0.05 * sin(t * (0.6 + hc2 * 0.8) + hc3 * 31.0)) / nCols;
  vec2 ep  = vec2((ex - 0.5) * aspect, ey - 0.5);
  float d  = length(p - ep);

  float fade    = smoothstep(0.0, 0.14, life) * (1.0 - smoothstep(0.5, 1.0, life));
  float scint   = 0.65 + 0.35 * sin(t * (1.6 + hc2 * 2.6) + hc * 43.0);
  // Or rosé ↔ grenat, tiré au sort par colonne
  vec3 colBraise = mix(
    vec3(0.91, 0.77, 0.63),
    vec3(0.88, 0.38, 0.50),
    0.5 + 0.5 * sin(hc * 57.0)
  );

  col += colBraise * (fade * scint * 0.05 / (d * d * 1.2 + 0.010));   // halo
  col += colBraise * (fade * scint * smoothstep(0.028, 0.006, d) * 0.4); // cœur

  /* Vignette : la nuit se resserre sur les bords */
  col *= 0.58 + 0.42 * smoothstep(1.25, 0.2, length(p * vec2(0.82, 1.0)));

  /* Grain fin : casse le banding des zones sombres */
  col += (hash21(gl_FragCoord.xy + fract(t) * 61.7) - 0.5) * 0.02;

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

export default function FondAmbiance() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', {
      antialias: false,
      alpha: false,
      powerPreference: 'low-power',
    });
    // Pas de WebGL ? On laisse le dégradé CSS du <body> faire le travail.
    if (!gl) {
      canvas.style.display = 'none';
      return;
    }

    const mouvementReduit = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

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
        throw new Error(
          `Programme non lié : ${gl.getProgramInfoLog(programme)}`,
        );
      }
    } catch (e) {
      console.error('[FondAmbiance]', e);
      canvas.style.display = 'none';
      return;
    }

    // Quad plein écran (-1..1), tiré en 3 triangles
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
    const uRes = gl.getUniformLocation(programme, 'uRes');
    const uTime = gl.getUniformLocation(programme, 'uTime');

    // DPR plafonné : le fond d'ambiance n'a pas besoin de la netteté 2x.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
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
      if (mouvementReduit && visible) dessiner(47.0); // 1 seule frame, figée
    };

    const dessiner = (tempsSec: number) => {
      gl.uniform1f(uTime, tempsSec);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    let raf = 0;
    let depart = performance.now();

    const boucle = (maintenant: number) => {
      if (visible) {
        dessiner((maintenant - depart) / 1000);
        raf = requestAnimationFrame(boucle);
      }
    };

    // Pause/reprise quand l'onglet est masqué (batterie)
    const suVisibilite = () => {
      visible = !document.hidden && !mouvementReduit;
      if (visible) {
        depart = performance.now();
        raf = requestAnimationFrame(boucle);
      } else {
        cancelAnimationFrame(raf);
      }
    };

    // Statique : 1 frame figée, redessinée si l'onglet réapparaît à
    // une autre taille. Sinon, loop animé avec pause sur onglet caché.
    const onVisibilite = () => {
      if (mouvementReduit) {
        if (!document.hidden) redimensionner();
      } else {
        suVisibilite();
      }
    };
    document.addEventListener('visibilitychange', onVisibilite);

    redimensionner();
    if (!mouvementReduit) {
      raf = requestAnimationFrame(boucle);
    }
    window.addEventListener('resize', redimensionner);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', redimensionner);
      document.removeEventListener('visibilitychange', onVisibilite);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(programme);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="fond-ambiance" />;
}