import { isIP } from 'node:net';

/** Only explicit proxy IPs/CIDRs are accepted; never trust arbitrary hops. */
export function parseTrustProxy(raw: string | undefined): false | string[] {
  if (!raw?.trim() || raw.trim() === 'false') return false;

  const proxies = raw.split(',').map((value) => value.trim());
  for (const proxy of proxies) {
    const [address, prefix, ...extra] = proxy.split('/');
    const family = isIP(address);
    if (
      !family ||
      extra.length > 0 ||
      (prefix !== undefined &&
        (!/^\d+$/.test(prefix) ||
          Number(prefix) < 1 ||
          Number(prefix) > (family === 4 ? 32 : 128)))
    ) {
      throw new Error('TRUST_PROXY must contain explicit IPs or CIDRs (no /0)');
    }
  }
  return proxies;
}
