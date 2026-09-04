// Test rapide : pdf.js lit The Predator (corpus permanent).
import { readFileSync } from 'fs';

async function main() {
  const data = new Uint8Array(
    readFileSync('C:/Users/dosso/dev/test-corpus/The_Predator_RuNyx.pdf')
  );
  const pdfjs: any = await import('pdfjs-dist');
  const doc = await pdfjs.getDocument({ data }).promise;
  console.log('Pages:', doc.numPages);

  // Test pages 1, 2, 10, 50, 100, 200, 296
  for (const p of [1, 2, 10, 50, 100, 200, 296]) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items = tc.items.length;
    const first = items > 0 ? (tc.items[0] as { str?: string }).str?.slice(0, 80) : '(vides)';
    console.log(`Page ${p}: ${items} items — "${first}"`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });