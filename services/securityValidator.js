const crypto = require('crypto');

// VM and Headless Software GPU Renderers
const SUSPICIOUS_GPU_RENDERERS = [
  'swiftshader',
  'llvmpipe',
  'mesa offscreen',
  'softpipe',
  'virtualbox',
  'vmware',
  'parallels',
  'qemu',
  'standard vga',
  'microsoft basic render driver',
  'software rasterizer'
];

class SecurityValidator {
  generateToken(secretKey) {
    const timestamp = Date.now();
    const nonce = crypto.randomBytes(8).toString('hex');
    const data = `${timestamp}.${nonce}`;
    const hmac = crypto.createHmac('sha256', secretKey).update(data).digest('hex');
    return `${timestamp}.${nonce}.${hmac}`;
  }

  verifyToken(token, secretKey, maxAgeSeconds = 300) {
    if (!token) return false;
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    const [timestampStr, nonce, receivedHmac] = parts;
    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp)) return false;

    const now = Date.now();
    if (now - timestamp > maxAgeSeconds * 1000) return false;
    if (timestamp > now + 60000) return false;

    const data = `${timestamp}.${nonce}`;
    const expectedHmac = crypto.createHmac('sha256', secretKey).update(data).digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(receivedHmac), Buffer.from(expectedHmac));
    } catch (e) {
      return false;
    }
  }

  validateVisitor({ ipIntel, fingerprint, config }) {
    const reasons = [];
    let isBot = false;
    let isVpn = false;
    let isDatacenter = false;

    const sec = config.security || {};

    // 1. IP Datacenter Check
    if (sec.blockDatacenter && ipIntel.isDatacenter) {
      isDatacenter = true;
      reasons.push(ipIntel.datacenterReason || `Datacenter / Cloud Hosting IP (${ipIntel.isp || ipIntel.as})`);
    }

    // 2. IP VPN / Proxy Check
    if (sec.blockVpnAndProxy && (ipIntel.isVpn || ipIntel.isProxy)) {
      isVpn = true;
      reasons.push(`Commercial VPN or Proxy detected (${ipIntel.isp || 'Flagged'})`);
    }

    // 3. Timezone Consistency Check (The IPFighter method)
    if (sec.blockTimezoneMismatch && fingerprint) {
      const clientTz = (fingerprint.timezone || '').trim().toLowerCase();
      const ipTz = (ipIntel.timezone || '').trim().toLowerCase();

      // Region comparison (e.g. America vs Asia, Europe vs Asia)
      if (clientTz && ipTz && ipTz !== 'utc' && !ipIntel.isLocal) {
        const clientRegion = clientTz.split('/')[0];
        const ipRegion = ipTz.split('/')[0];
        if (clientRegion && ipRegion && clientRegion !== ipRegion) {
          isVpn = true;
          reasons.push(`Cross-Continent Location Mismatch: Browser in "${fingerprint.timezone}", IP in "${ipIntel.timezone}"`);
        }
      }

      // Mathematical offset comparison (in seconds)
      if (fingerprint.timezoneOffset !== undefined && ipIntel.timezoneOffset !== undefined && !ipIntel.isLocal) {
        // Javascript getTimezoneOffset returns minutes from UTC with opposite sign
        // e.g. UTC+5:30 -> -330 min -> clientOffsetSec = +19800 sec
        const clientOffsetSec = -1 * fingerprint.timezoneOffset * 60;
        const ipOffsetSec = ipIntel.timezoneOffset;

        const diffSeconds = Math.abs(clientOffsetSec - ipOffsetSec);
        // If difference is greater than 30 minutes (1800s), timezone is spoofed/VPN
        if (diffSeconds > 1800) {
          isVpn = true;
          const diffHours = (diffSeconds / 3600).toFixed(1);
          reasons.push(`Clock Timezone Offset Discrepancy: ${diffHours} hour mismatch between browser clock and IP location`);
        }
      }
    }

    // 4. Client-side VPN flags reported by client shield
    if (fingerprint && fingerprint.clientVpnDetected) {
      isVpn = true;
      reasons.push(`Client telemetry confirmed proxy/VPN: ${fingerprint.clientVpnReason || 'Flagged'}`);
    }

    // 5. Headless Browser / Automation Checks
    if (fingerprint) {
      if (sec.blockHeadlessBrowsers && fingerprint.webdriver === true) {
        isBot = true;
        reasons.push('Automated Headless Browser detected (navigator.webdriver = true)');
      }

      if (fingerprint.automationArtifacts && fingerprint.automationArtifacts.length > 0) {
        isBot = true;
        reasons.push(`Automation tool signatures found: ${fingerprint.automationArtifacts.join(', ')}`);
      }

      if (sec.blockVmGpuRenderers && fingerprint.gpuRenderer) {
        const gpuLower = fingerprint.gpuRenderer.toLowerCase();
        for (const badGpu of SUSPICIOUS_GPU_RENDERERS) {
          if (gpuLower.includes(badGpu)) {
            isBot = true;
            reasons.push(`Virtual Machine / Headless GPU detected: "${fingerprint.gpuRenderer}"`);
            break;
          }
        }
      }

      if (fingerprint.screenWidth === 0 || fingerprint.screenHeight === 0 || fingerprint.colorDepth < 16) {
        isBot = true;
        reasons.push(`Abnormal screen metrics (${fingerprint.screenWidth}x${fingerprint.screenHeight}, depth ${fingerprint.colorDepth})`);
      }

      // Zero plugins check is ONLY applicable to Desktop Chrome (Mobile Chrome never has plugins)
      if (fingerprint.isChrome && !fingerprint.isMobile && fingerprint.pluginsLength === 0) {
        isBot = true;
        reasons.push('Headless Chrome signature: zero plugins present on desktop');
      }

      if (sec.requireHumanInteraction) {
        const interaction = fingerprint.interaction || {};
        const moves = interaction.mouseMoves || 0;
        const scrolls = interaction.scrolls || 0;
        const touches = interaction.touches || 0;
        const dwellMs = interaction.dwellTimeMs || 0;

        // Instant automated execution check (< 300ms without any event)
        if (dwellMs < 300 && (moves + scrolls + touches === 0)) {
          isBot = true;
          reasons.push('Zero human interaction detected (instant automated execution)');
        }
      }
    }

    const passed = (!isBot && !isVpn && !isDatacenter);

    return {
      passed,
      isBot,
      isVpn,
      isDatacenter,
      reasons,
      action: passed ? 'ALLOW' : 'BLOCK'
    };
  }
}

module.exports = new SecurityValidator();
