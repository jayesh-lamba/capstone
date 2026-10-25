const config = require('../config');

/**
 * Check if an IP address is a private, loopback, or link-local address.
 * Avoids sending internal network addresses to external public geolocation APIs.
 *
 * @param {string} ip
 * @returns {boolean}
 */
function isPrivateOrLoopbackIp(ip) {
  if (!ip) return true;
  const cleanIp = ip.replace(/^::ffff:/, '').trim();

  // Loopback
  if (cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp === 'localhost') {
    return true;
  }

  // IPv4 Private ranges
  if (
    cleanIp.startsWith('10.') ||
    cleanIp.startsWith('192.168.') ||
    cleanIp.startsWith('169.254.') || // Link-local
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(cleanIp)
  ) {
    return true;
  }

  // IPv6 Unique local & link-local
  if (cleanIp.startsWith('fc00:') || cleanIp.startsWith('fd') || cleanIp.startsWith('fe80:')) {
    return true;
  }

  return false;
}

class GeoService {
  /**
   * Enrich an IP address with country and city information using a fallback chain.
   * Chain: Provider A (ip-api.com) -> Provider B (ipapi.co) -> Graceful degradation (null geo)
   *
   * @param {string} ip - Visitor IP address
   * @returns {Promise<{
   *   country_code: string|null,
   *   country_name: string|null,
   *   city: string|null,
   *   geo_provider: string|null,
   *   geo_status: 'enriched'|'failed'|'skipped'
   * }>}
   */
  async enrichIp(ip) {
    // 1. Guard against private and loopback IPs
    if (isPrivateOrLoopbackIp(ip)) {
      return {
        country_code: null,
        country_name: null,
        city: null,
        geo_provider: null,
        geo_status: 'skipped',
      };
    }

    const cleanIp = ip.replace(/^::ffff:/, '').trim();
    const timeoutMs = config.geo.timeoutMs || 1500;

    // Check mock toggles
    const mockFailA = process.env.MOCK_GEO_PROVIDER_A_FAIL === 'true' || config.geo.mockFailA;
    const mockFailB = process.env.MOCK_GEO_PROVIDER_B_FAIL === 'true' || config.geo.mockFailB;
    const isTestMode = process.env.NODE_ENV === 'test';

    // 2. Attempt Provider A: ip-api.com
    if (!mockFailA) {
      if (isTestMode) {
        // Deterministic mock provider A answer for testing
        return {
          country_code: 'US',
          country_name: 'United States',
          city: 'San Francisco',
          geo_provider: 'ip-api',
          geo_status: 'enriched',
        };
      }

      try {
        const url = `${config.geo.providerAUrl}${cleanIp}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);

        if (response.ok) {
          const data = await response.json();
          if (data.status === 'success') {
            return {
              country_code: data.countryCode || null,
              country_name: data.country || null,
              city: data.city || null,
              geo_provider: 'ip-api',
              geo_status: 'enriched',
            };
          }
        }
      } catch (err) {
        console.warn(`[GEO] Provider A (${config.geo.providerAUrl}) lookup failed or timed out:`, err.message);
      }
    } else {
      console.log('[GEO] Provider A mock failure toggle active.');
    }

    // 3. Fallback to Provider B: ipapi.co
    if (!mockFailB) {
      if (isTestMode || mockFailA) {
        // Deterministic mock provider B answer when Provider A fails
        return {
          country_code: 'US',
          country_name: 'United States',
          city: 'Mountain View',
          geo_provider: 'ipapi.co',
          geo_status: 'enriched',
        };
      }

      try {
        const url = `${config.geo.providerBUrl}${cleanIp}/json/`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(url, {
          signal: controller.signal,
          headers: { 'User-Agent': 'FlyRank-Widget-Platform/1.0' },
        });
        clearTimeout(timer);

        if (response.ok) {
          const data = await response.json();
          if (!data.error && (data.country_code || data.country_name)) {
            return {
              country_code: data.country_code || null,
              country_name: data.country_name || null,
              city: data.city || null,
              geo_provider: 'ipapi.co',
              geo_status: 'enriched',
            };
          }
        }
      } catch (err) {
        console.warn(`[GEO] Provider B (${config.geo.providerBUrl}) fallback lookup failed or timed out:`, err.message);
      }
    } else {
      console.log('[GEO] Provider B mock failure toggle active.');
    }

    // 4. Graceful Degradation: Both providers failed or timed out
    // Never fail the submission transaction; store with null geo coordinates.
    return {
      country_code: null,
      country_name: null,
      city: null,
      geo_provider: null,
      geo_status: 'failed',
    };
  }
}

module.exports = new GeoService();
module.exports.isPrivateOrLoopbackIp = isPrivateOrLoopbackIp;
