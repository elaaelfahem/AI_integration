import dns from 'node:dns/promises';
import { setTimeout as delay } from 'node:timers/promises';
export const isDnsFailure = error => ['EAI_AGAIN', 'ENOTFOUND', 'ETIMEOUT', 'ESERVFAIL'].includes(error?.code);
// Retry only transient resolution errors; every result still passes safeUrl checks.
export async function lookupWithRetry(hostname, lookup = dns.lookup, sleep = delay) {
  for (let attempt = 0; ; attempt++) {
    try { return await lookup(hostname, {all:true}); }
    catch (error) {
      if (error.code !== 'EAI_AGAIN' || attempt >= 2) throw error;
      await sleep(200 * (attempt + 1));
    }
  }
}
