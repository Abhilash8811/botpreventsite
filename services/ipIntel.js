const https = require('https');
const http = require('http');

// Known Datacenter / Hosting / Cloud / VPN ASNs
const KNOWN_DATACENTER_ASNS = new Set([
  'AS16509', // Amazon AWS
  'AS14618', // Amazon AWS
  'AS15169', // Google Cloud
  'AS8075',  // Microsoft Azure
  'AS14061', // DigitalOcean
  'AS24940', // Hetzner Online
  'AS16276', // OVH SAS
  'AS63949', // Linode / Akamai
  'AS51167', // Contabo
  'AS20473', // Choopa / Vultr
  'AS46562', // Performive
  'AS62240', // Clouvider
  'AS36352', // ColoCrossing
  'AS60068', // Datacamp Limited / CDN77 (NordVPN / Surfshark / ExpressVPN infra)
  'AS9009',  // M247 (Major commercial VPN backbone)
  'AS202425',// IPGL / Datacamp
  'AS209242',// Cloudflare Warp / Relay
  'AS13335', // Cloudflare
  'AS49505', // Selectel
  'AS29073', // Equinix
  'AS197695',// AS-NAV - NordVPN / Surfshark infra
  'AS39351', // Mullvad VPN
  'AS208312',// Mullvad VPN
  'AS51852', // Private Internet Access
  'AS400271',// Tencent Cloud
  'AS37963', // Alibaba Cloud
  'AS31898', // Oracle Cloud
  'AS45102', // Alibaba Cloud
  'AS21859', // Zenlayer
  'AS53667', // FranTech / BuyVM
  'AS54290', // Hostwinds
  'AS397444',// Windscribe
  'AS204601',// G-Core Labs
  'AS47583', // Hostinger
  'AS198471',// G-Core Labs
  'AS207990',// Hosting
  'AS206092',// Tenable
  'AS212238' // Datacamp
]);

// Keywords indicating VPN, proxy, or datacenter hosting
const SUSPICIOUS_KEYWORDS = [
  'datacamp', 'm247', 'vpn', 'proxy', 'hosting', 'datacenter', 'data center',
  'cloud', 'server', 'dedicated', 'vps', 'compute', 'amazon', 'aws',
  'google llc', 'microsoft', 'azure', 'alibaba', 'tencent', 'oracle',
  'digitalocean', 'hetzner', 'linode', 'ovh', 'vultr', 'leaseweb', 'choopa',
  'packetflow', 'fasthosts', 'zenlayer', 'colocrossing', 'cogent', 'nordvpn',
  'expressvpn', 'surfshark', 'proton', 'ipvanish', 'cyberghost', 'tunnelbear',
  'mullvad', 'private internet access', 'windscribe', 'hide.me', 'fastly',
  'cdn77', 'gcore', 'g-core', 'hostinger', 'contabo', 'scaleway', 'kamatera',
  'interserver', 'hostwinds', 'ionos', '1&1', 'strato', 'inmotion', 'bluehost',
  'namecheap', 'wireguard', 'openvpn', 'shadowsocks'
];

class IpIntelService {
  constructor() {
    this.cache = new Map();
    this.cacheTtlMs = 24 * 60 * 60 * 1000;
  }

  getClientIp(req) {
    // 1. Cloudflare header
    const cfIp = req.headers['cf-connecting-ip'];
    if (cfIp) return cfIp.trim();

    // 2. Standard proxy forwarded header
    const xForwarded = req.headers['x-forwarded-for'];
    if (xForwarded) {
      const parts = xForwarded.split(',');
      const clientIp = parts[0].trim();
      // If client IP is not an internal container address, return it
      if (clientIp && !clientIp.startsWith('10.') && !clientIp.startsWith('172.16.') && !clientIp.startsWith('192.168.')) {
        return clientIp;
      }
    }

    // 3. Fallback proxy headers
    const xReal = req.headers['x-real-ip'];
    if (xReal) return xReal.trim();

    const trueClient = req.headers['true-client-ip'];
    if (trueClient) return trueClient.trim();

    return req.ip || req.socket.remoteAddress || '127.0.0.1';
  }

  isStrictLocalhost(ip) {
    return (
      process.env.NODE_ENV !== 'production' &&
      (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost')
    );
  }

  async lookupIp(ip, config = {}) {
    // Only bypass if running purely locally in dev on 127.0.0.1
    if (this.isStrictLocalhost(ip)) {
      return {
        ip: ip,
        country: 'Local Network',
        countryCode: 'DEV',
        city: 'Localhost',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        timezoneOffset: 0,
        isp: 'Local Development Environment',
        org: 'Local Network',
        as: 'AS0 Local',
        isDatacenter: false,
        isVpn: false,
        isProxy: false,
        isLocal: true
      };
    }

    // Check cache
    const cached = this.cache.get(ip);
    if (cached && (Date.now() - cached.timestamp < this.cacheTtlMs)) {
      return cached.data;
    }

    let intel = null;

    // 1. IPinfo.io token integration (hardcoded default token: b9f68c86d091d3)
    const ipinfoToken = (config.security && config.security.ipinfoToken) || process.env.IPINFO_TOKEN || 'b9f68c86d091d3';
    if (ipinfoToken) {
      try {
        intel = await this.queryIpInfo(ip, ipinfoToken);
      } catch (err) {
        console.warn(`[BotShield] IPinfo lookup error: ${err.message}`);
      }
    }

    // 2. Optional ProxyCheck.io API Key
    if (!intel && config.security && config.security.proxyCheckApiKey) {
      try {
        intel = await this.queryProxyCheck(ip, config.security.proxyCheckApiKey);
      } catch (err) {
        console.warn(`[BotShield] ProxyCheck lookup error: ${err.message}`);
      }
    }

    // 2. HTTPS ipwho.is lookup (Works directly over HTTPS, no datacenter blocks)
    if (!intel) {
      try {
        intel = await this.queryIpWhois(ip);
      } catch (err) {
        console.warn(`[BotShield] ipwho.is error: ${err.message}. Trying freeipapi.`);
      }
    }

    // 3. Fallback: freeipapi.com
    if (!intel) {
      try {
        intel = await this.queryFreeIpApi(ip);
      } catch (err) {
        console.warn(`[BotShield] freeipapi error: ${err.message}`);
      }
    }

    // 4. Default fallback
    if (!intel) {
      intel = {
        ip,
        country: 'Unknown',
        countryCode: 'XX',
        city: 'Unknown',
        timezone: 'UTC',
        timezoneOffset: 0,
        isp: 'Unknown',
        org: 'Unknown',
        as: 'Unknown',
        isDatacenter: false,
        isVpn: false,
        isProxy: false
      };
    }

    // Enhance with deep ASN & keyword heuristic analysis
    this.enhanceThreatIntelligence(intel);

    this.cache.set(ip, { timestamp: Date.now(), data: intel });
    return intel;
  }

  enhanceThreatIntelligence(intel) {
    const asStr = (intel.as || '').toUpperCase();
    const ispStr = (intel.isp || '').toLowerCase();
    const orgStr = (intel.org || '').toLowerCase();

    // Check ASN against known datacenter / VPN ASNs
    for (const asn of KNOWN_DATACENTER_ASNS) {
      if (asStr.includes(asn)) {
        intel.isDatacenter = true;
        intel.isVpn = true;
        intel.datacenterReason = `Known Datacenter/VPN ASN detected (${asn})`;
        return;
      }
    }

    // Check keywords in ISP and Organization
    for (const kw of SUSPICIOUS_KEYWORDS) {
      if (ispStr.includes(kw) || orgStr.includes(kw) || asStr.toLowerCase().includes(kw)) {
        intel.isDatacenter = true;
        intel.isVpn = true;
        intel.datacenterReason = `Datacenter/VPN keyword detected: "${kw}" in ${intel.isp || intel.org || intel.as}`;
        return;
      }
    }
  }

  queryIpWhois(ip) {
    return new Promise((resolve, reject) => {
      const url = `https://ipwho.is/${ip}`;
      const req = https.get(url, { timeout: 3500 }, (res) => {
        let rawData = '';
        res.on('data', chunk => { rawData += chunk; });
        res.on('end', () => {
          try {
            const data = JSON.parse(rawData);
            if (data.success !== false) {
              const conn = data.connection || {};
              const tz = data.timezone || {};
              resolve({
                ip,
                country: data.country || 'Unknown',
                countryCode: data.country_code || 'XX',
                city: data.city || 'Unknown',
                timezone: tz.id || 'UTC',
                timezoneOffset: tz.offset !== undefined ? tz.offset : 0, // offset in seconds
                isp: conn.isp || 'Unknown',
                org: conn.org || 'Unknown',
                as: conn.asn ? `AS${conn.asn}` : 'Unknown',
                isDatacenter: false,
                isVpn: false,
                isProxy: false
              });
            } else {
              reject(new Error(data.message || 'ipwho.is unsuccessful'));
            }
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('ipwho.is timed out'));
      });
    });
  }

  queryFreeIpApi(ip) {
    return new Promise((resolve, reject) => {
      const url = `https://freeipapi.com/api/json/${ip}`;
      const req = https.get(url, { timeout: 3500 }, (res) => {
        let rawData = '';
        res.on('data', chunk => { rawData += chunk; });
        res.on('end', () => {
          try {
            const data = JSON.parse(rawData);
            if (data.ipAddress) {
              const tzList = data.timeZones || [];
              const tz = tzList[0] || 'UTC';
              resolve({
                ip,
                country: data.countryName || 'Unknown',
                countryCode: data.countryCode || 'XX',
                city: data.cityName || 'Unknown',
                timezone: tz,
                timezoneOffset: 0,
                isp: data.asnOrganization || 'Unknown',
                org: data.asnOrganization || 'Unknown',
                as: data.asn ? `AS${data.asn}` : 'Unknown',
                isDatacenter: false,
                isVpn: !!data.isProxy,
                isProxy: !!data.isProxy
              });
            } else {
              reject(new Error('freeipapi unsuccessful'));
            }
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('freeipapi timed out'));
      });
    });
  }

  queryIpInfo(ip, token) {
    return new Promise((resolve, reject) => {
      const url = `https://ipinfo.io/${ip}/json?token=${token}`;
      const req = https.get(url, { timeout: 3500 }, (res) => {
        let rawData = '';
        res.on('data', chunk => { rawData += chunk; });
        res.on('end', () => {
          try {
            const data = JSON.parse(rawData);
            if (data.ip) {
              const privacy = data.privacy || {};
              const hostname = (data.hostname || '').toLowerCase();
              let isVpn = !!privacy.vpn;
              let isProxy = !!privacy.proxy;
              let isTor = !!privacy.tor || hostname.includes('tor-') || hostname.includes('.tor.');
              let isHosting = !!privacy.hosting;

              // Check hostname indicators
              const badHostKw = ['vpn', 'proxy', 'tor', 'exit', 'relay', 'datacamp', 'cdn77', 'm247', 'host', 'server', 'compute', 'aws', 'vps'];
              for (const kw of badHostKw) {
                if (hostname.includes(kw)) {
                  isHosting = true;
                  if (kw === 'vpn' || kw === 'proxy' || kw === 'tor' || kw === 'exit') isVpn = true;
                  break;
                }
              }

              resolve({
                ip,
                country: data.country || 'Unknown',
                countryCode: data.country || 'XX',
                city: data.city || 'Unknown',
                timezone: data.timezone || 'UTC',
                timezoneOffset: 0,
                isp: data.org || 'Unknown',
                org: data.org || 'Unknown',
                as: data.org ? data.org.split(' ')[0] : 'Unknown',
                isDatacenter: isHosting,
                isVpn: isVpn,
                isProxy: isProxy,
                isTor: isTor
              });
            } else {
              reject(new Error('IPinfo invalid response'));
            }
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('IPinfo timed out'));
      });
    });
  }

  queryProxyCheck(ip, apiKey) {
    return new Promise((resolve, reject) => {
      const url = `https://proxycheck.io/v2/${ip}?key=${apiKey}&vpn=1&asn=1&time=1`;
      const req = https.get(url, { timeout: 3500 }, (res) => {
        let rawData = '';
        res.on('data', chunk => { rawData += chunk; });
        res.on('end', () => {
          try {
            const data = JSON.parse(rawData);
            if (data.status === 'ok' && data[ip]) {
              const resIp = data[ip];
              const isProxy = resIp.proxy === 'yes';
              const isVpn = resIp.type === 'VPN' || isProxy;
              resolve({
                ip,
                country: resIp.country || 'Unknown',
                countryCode: resIp.isocode || 'XX',
                city: resIp.city || 'Unknown',
                timezone: resIp.timezone || 'UTC',
                timezoneOffset: 0,
                isp: resIp.provider || resIp.organisation || 'Unknown',
                org: resIp.organisation || 'Unknown',
                as: resIp.asn || 'Unknown',
                isDatacenter: resIp.type === 'Business' || isVpn,
                isVpn: isVpn,
                isProxy: isProxy
              });
            } else {
              reject(new Error('ProxyCheck invalid response'));
            }
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('ProxyCheck timed out'));
      });
    });
  }
}

module.exports = new IpIntelService();
