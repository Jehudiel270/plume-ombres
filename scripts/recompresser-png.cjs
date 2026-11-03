// Recompression PNG STRICTEMENT sans perte : on n'inflate/redéflate que
// le flux IDAT (les octets de pixels et les octets de filtre restent
// identiques au bit près). Aucun changement de couleur, aucune
// quantification — contrairement à un ré-encodage par libvips.
const fs = require('fs');
const zlib = require('zlib');
const crypto = require('crypto');

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function lireChunks(buf) {
  const chunks = [];
  let i = 8;
  while (i < buf.length) {
    const longueur = buf.readUInt32BE(i);
    const type = buf.toString('ascii', i + 4, i + 8);
    const donnees = buf.subarray(i + 8, i + 8 + longueur);
    chunks.push({ type, donnees });
    i += 12 + longueur;
  }
  return chunks;
}

function ecrireChunks(chunks) {
  const morceaux = [SIGNATURE];
  for (const { type, donnees } of chunks) {
    const entete = Buffer.alloc(8);
    entete.writeUInt32BE(donnees.length, 0);
    entete.write(type, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(type, 'ascii'), donnees])) >>> 0, 0);
    morceaux.push(entete, donnees, crc);
  }
  return Buffer.concat(morceaux);
}

const fichiers = process.argv.slice(2);
if (fichiers.length === 0) {
  console.error('usage: node recompresser-png.cjs fichier.png [...]');
  process.exit(1);
}

let totalAvant = 0;
let totalApres = 0;
for (const f of fichiers) {
  const avant = fs.readFileSync(f);
  if (!avant.subarray(0, 8).equals(SIGNATURE)) {
    console.log(`✗ ${f} : pas un PNG`);
    continue;
  }
  const chunks = lireChunks(avant);
  const idats = chunks.filter((c) => c.type === 'IDAT');
  if (idats.length === 0) {
    console.log(`✗ ${f} : aucun IDAT`);
    continue;
  }
  const brut = zlib.inflateSync(Buffer.concat(idats.map((c) => c.donnees)));
  const recompresse = zlib.deflateSync(brut, { level: 9, memLevel: 9, strategy: zlib.constants.Z_DEFAULT_STRATEGY });

  // Réassemblage : tous les chunks dans l'ordre, IDAT fusionné au premier.
  const sortie = [];
  let idatPlace = false;
  for (const c of chunks) {
    if (c.type === 'IDAT') {
      if (!idatPlace) {
        sortie.push({ type: 'IDAT', donnees: recompresse });
        idatPlace = true;
      }
      continue;
    }
    sortie.push(c);
  }
  const apres = ecrireChunks(sortie);

  // Vérification : le flux décompressé doit être identique à l'octet près.
  const verif = zlib.inflateSync(
    Buffer.concat(lireChunks(apres).filter((c) => c.type === 'IDAT').map((c) => c.donnees))
  );
  const identique = verif.equals(brut);

  if (identique && apres.length < avant.length) fs.writeFileSync(f, apres);
  totalAvant += avant.length;
  totalApres += identique ? Math.min(apres.length, avant.length) : avant.length;
  console.log(
    `${identique ? '✓' : '✗'} ${f} : ${(avant.length / 1024).toFixed(0)}K → ${(
      Math.min(apres.length, avant.length) / 1024
    ).toFixed(0)}K (pixels intacts : ${identique})`
  );
}
console.log(
  `TOTAL ${(totalAvant / 1024).toFixed(0)}K → ${(totalApres / 1024).toFixed(0)}K ` +
    `(−${(((totalAvant - totalApres) / totalAvant) * 100).toFixed(1)}%)`
);
