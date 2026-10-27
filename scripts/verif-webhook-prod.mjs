// Preuve post-deploiement : le webhook en PRODUCTION.
// 1. ping FedaPay -> doit repondre 200 {ok:true,ping:true} (code nouveau)
// 2. sans signature -> 401
// 3. signature valide -> 200 (HMAC accepte, re-verification API OK)
import { createHmac } from 'node:crypto';

const BASE = 'https://plume-ombres.vercel.app/api/paiement/webhook';
const secret = process.env.WH;

async function ping() {
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'ping' }),
  });
  const txt = await r.text();
  console.log(`ping            HTTP ${r.status} ${txt.slice(0, 80)}`);
  return r.status === 200 && txt.includes('ping');
}

async function sansSignature() {
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'transaction.approved', entity: { id: 1 } }),
  });
  console.log(`sans signature  HTTP ${r.status} ${(await r.text()).slice(0, 80)}`);
  return r.status === 401;
}

async function signe() {
  const t = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({
    name: 'transaction.declined',
    entity: { id: 113606714, merchant_reference: 'PLU-PREUVE-PROD', status: 'declined' },
  });
  const s = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-FEDAPAY-SIGNATURE': `t=${t},s=${s}` },
    body,
  });
  const txt = await r.text();
  console.log(`signature valide HTTP ${r.status} ${txt.slice(0, 140)}`);
  return r.status === 200;
}

const resultats = { ping: await ping(), sansSignature: await sansSignature(), signe: await signe() };
console.log(resultats);
process.exitCode = Object.values(resultats).every(Boolean) ? 0 : 1;
