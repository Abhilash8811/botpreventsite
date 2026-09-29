const https = require('https');
const http = require('http');

// Known Datacenter / Hosting / Cloud ASNs
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
  'AS60068', // Datacamp Limited
  'AS9009',  // M247 (Major VPN provider)
  'AS202425',// IPGL / Datacamp
  'AS209242',// Cloudflare Warp / Relay
  'AS13335', // Cloudflare Edge (can be proxy)
  'AS49505', // Selectel
  'AS29073', // Equinix
  'AS197695' // AS-NAV - NordVPN / Surfshark infra
]);

// Keywords in ISP / Org names that indicate datacenter, cloud, or VPN hosting
const SUSPICIOUS_KEYWORDS = [
  'hosting', 'datacenter', 'data center', 'cloud', 'server', 'dedicated',
  'vps', 'compute', 'amazon', 'aws', 'google llc', 'microsoft', 'azure',
  'alibaba', 'tencent', 'oracle', 'digitalocean', 'hetzner', 'linode',
  'ovh', 'vultr', 'leaseweb', 'choopa', 'm247', 'packetflow', 'fasthosts',
  'zenlayer', 'colocrossing', 'cogent', 'nordvpn', 'expressvpn', 'surfshark',
  'proton', 'ipvanish', 'cyberghost', 'tunnelbear', 'mullvad', 'private internet access'
];

class IpIntelService {
  constructor() {
    this.cache = new Map();
    this.cacheTtlMs = 24 * 60 * 60 * 1000; // 24 hours cache
  }

  getClientIp(req) {
    // Priority order for IP resolution behind Cloudflare or reverse proxies
    const headers = [
      'cf-connecting-ip',
      'x-real-ip',
      'x-forwarded-for',
      'true-client-ip'
    ];

    for (const h of headers) {
      const val = req.headers[h];
      if (val) {
        // x-forwarded-for can be comma separated list, first is client
        const first = val.split(',')[0].trim();
        if (first) return first;
      }
    }

    return req.socket.remoteAddress || req.ip || '127.0.0.1';
  }

  isLocalOrPrivateIp(ip) {
    if (!ip) return true;
    return (
      ip === '127.0.0.1' ||
      ip === '::1' ||
      ip === 'localhost' ||
      ip.startsWith('10.') ||
      ip.startsWith('192.168.') ||
      ip.startsWith('172.16.') ||
      ip.startsWith('172.17.') ||
      ip.startsWith('172.18.') ||
      ip.startsWith('172.19.') ||
      ip.startsWith('172.2') ||
      ip.startsWith('172.30.') ||
      ip.startsWith('172.31.') ||
      ip.startsWith('::ffff:127.') ||
      ip.startsWith('::ffff:192.168.') ||
      ip.startsWith('::ffff:10.')
    );
  }

  async lookupIp(ip, config = {}) {
    // If local test IP, return clean simulated residential IP info
    if (this.isLocalOrPrivateIp(ip)) {
      return {
        ip: ip,
        country: 'Local Network',
        countryCode: 'DEV',
        city: 'Localhost',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        isp: 'Local Development Environment',
        org: 'Local Network',
        as: 'AS0 Local',
        isDatacenter: false,
        isVpn: false,
        isProxy: false,
        isTor: false,
        isLocal: true
      };
    }

    // Check cache
    const cached = this.cache.get(ip);
    if (cached && (Date.now() - cached.timestamp < this.cacheTtlMs)) {
      return cached.data;
    }

    let intel = null;

    // 1. If ProxyCheck.io API key is provided
    if (config.security && config.security.proxyCheckApiKey) {
      try {
        intel = await this.queryProxyCheck(ip, config.security.proxyCheckApiKey);
      } catch (err) {
        console.warn(`[BotShield] ProxyCheck.io lookup failed: ${err.message}. Falling back to ip-api.`);
      }
    }

    // 2. Query free ip-api with hosting/proxy flags
    if (!intel) {
      try {
        intel = await this.queryIpApi(ip);
      } catch (err) {
        console.warn(`[BotShield] ip-api query failed: ${err.message}`);
        intel = {
          ip,
          country: 'Unknown',
          countryCode: 'XX',
          city: 'Unknown',
          timezone: 'UTC',
          isp: 'Unknown',
          org: 'Unknown',
          as: 'Unknown',
          isDatacenter: false,
          isVpn: false,
          isProxy: false
        };
      }
    }

    // Apply ASN & keyword heuristic analysis
    this.enhanceThreatIntelligence(intel);

    // Save to cache
    this.cache.set(ip, { timestamp: Date.now(), data: intel });
    return intel;
  }

  enhanceThreatIntelligence(intel) {
    const asStr = (intel.as || '').toUpperCase();
    const ispStr = (intel.isp || '').toLowerCase();
    const orgStr = (intel.org || '').toLowerCase();

    // Check ASN against known datacenter ASNs
    for (const asn of KNOWN_DATACENTER_ASNS) {
      if (asStr.includes(asn)) {
        intel.isDatacenter = true;
        intel.datacenterReason = `Known Datacenter ASN: ${asn}`;
        break;
      }
    }

    // Check keywords in ISP and Organization
    for (const kw of SUSPICIOUS_KEYWORDS) {
      if (ispStr.includes(kw) || orgStr.includes(kw)) {
        intel.isDatacenter = true;
        intel.datacenterReason = `Datacenter/Hosting provider keyword detected: "${kw}"`;
        break;
      }
    }
  }

  queryIpApi(ip) {
    return new Promise((resolve, reject) => {
      const url = `http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,city,timezone,isp,org,as,hosting,proxy`;
      
      const req = http.get(url, { timeout: 3500 }, (res) => {
        let rawData = '';
        res.on('data', chunk => { rawData += chunk; });
        res.on('end', () => {
          try {
            const data = JSON.parse(rawData);
            if (data.status === 'success') {
              resolve({
                ip,
                country: data.country || 'Unknown',
                countryCode: data.countryCode || 'XX',
                city: data.city || 'Unknown',
                timezone: data.timezone || 'UTC',
                isp: data.isp || 'Unknown',
                org: data.org || 'Unknown',
                as: data.as || 'Unknown',
                isDatacenter: !!data.hosting,
                isVpn: !!data.proxy,
                isProxy: !!data.proxy
              });
            } else {
              reject(new Error(data.message || 'ip-api unsuccessful'));
            }
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('ip-api request timed out'));
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
                isp: resIp.provider || resIp.organisation || 'Unknown',
                org: resIp.organisation || 'Unknown',
                as: resIp.asn || 'Unknown',
                isDatacenter: resIp.type === 'Business' || isVpn,
                isVpn: isVpn,
                isProxy: isProxy
              });
            } else {
              reject(new Error('Invalid response from proxycheck'));
            }
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('ProxyCheck request timed out'));
      });
    });
  }
}

module.exports = new IpIntelService();
