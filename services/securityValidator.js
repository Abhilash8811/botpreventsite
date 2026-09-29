const crypto = require('crypto');

// VM and Headless Software GPU Renderers (commonly used in Puppeteer / Playwright / Docker VMs)
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
  generateToken(ip, secretKey) {
    const timestamp = Date.now();
    const nonce = crypto.randomBytes(8).toString('hex');
    const data = `${ip}|${timestamp}|${nonce}`;
    const hmac = crypto.createHmac('sha256', secretKey).update(data).digest('hex');
    return `${timestamp}.${nonce}.${hmac}`;
  }

  verifyToken(token, ip, secretKey, maxAgeSeconds = 300) {
    if (!token) return false;
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    const [timestampStr, nonce, receivedHmac] = parts;
    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp)) return false;

    // Check expiry
    const now = Date.now();
    if (now - timestamp > maxAgeSeconds * 1000) return false;
    if (timestamp > now + 60000) return false; // future timestamp rejection

    const data = `${ip}|${timestamp}|${nonce}`;
    const expectedHmac = crypto.createHmac('sha256', secretKey).update(data).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(receivedHmac), Buffer.from(expectedHmac));
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

    // 3. Timezone Consistency Check (Inspired by ipfighter.com)
    if (sec.blockTimezoneMismatch && fingerprint) {
      const clientTz = (fingerprint.timezone || '').trim().toLowerCase();
      const ipTz = (ipIntel.timezone || '').trim().toLowerCase();

      // Check timezone offset if available
      if (clientTz && ipTz && ipTz !== 'utc' && !ipIntel.isLocal) {
        // Compare regions/cities
        const clientRegion = clientTz.split('/')[0];
        const ipRegion = ipTz.split('/')[0];

        if (clientRegion && ipRegion && clientRegion !== ipRegion) {
          isVpn = true;
          reasons.push(`Timezone Geolocation Mismatch: Browser reports "${fingerprint.timezone}", IP locates in "${ipIntel.timezone}"`);
        }
      }
    }

    // 4. Headless Browser / Automation Checks
    if (fingerprint) {
      // Check navigator.webdriver
      if (sec.blockHeadlessBrowsers && fingerprint.webdriver === true) {
        isBot = true;
        reasons.push('Automated Headless Browser detected (navigator.webdriver = true)');
      }

      // Check automation artifacts
      if (fingerprint.automationArtifacts && fingerprint.automationArtifacts.length > 0) {
        isBot = true;
        reasons.push(`Automation tool signatures found: ${fingerprint.automationArtifacts.join(', ')}`);
      }

      // Check GPU Renderer (Virtual Machine / Headless software rasterizer)
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

      // Check Screen & Window Metrics
      if (fingerprint.screenWidth === 0 || fingerprint.screenHeight === 0 || fingerprint.colorDepth < 16) {
        isBot = true;
        reasons.push(`Abnormal screen metrics (${fingerprint.screenWidth}x${fingerprint.screenHeight}, depth ${fingerprint.colorDepth})`);
      }

      // Check Plugins
      if (fingerprint.isChrome && fingerprint.pluginsLength === 0) {
        isBot = true;
        reasons.push('Headless Chrome signature: zero plugins present');
      }

      // Check Human Interaction (Entropy)
      if (sec.requireHumanInteraction) {
        const interaction = fingerprint.interaction || {};
        const moves = interaction.mouseMoves || 0;
        const scrolls = interaction.scrolls || 0;
        const touches = interaction.touches || 0;
        const dwellMs = interaction.dwellTimeMs || 0;

        if (dwellMs < 400 && (moves + scrolls + touches === 0)) {
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
