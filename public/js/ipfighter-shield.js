/**
 * IPFighter Shield - Deep Browser Fingerprinting & Anti-Bot Defense
 * Real-time hardware, timezone & VPN detection
 */
(function() {
  'use strict';

  const startTime = Date.now();
  let mouseMoves = 0;
  let scrolls = 0;
  let touches = 0;
  let keys = 0;
  let verified = false;

  function onMouseMove() { mouseMoves++; }
  function onScroll() { scrolls++; }
  function onTouch() { touches++; }
  function onKeyDown() { keys++; }

  window.addEventListener('mousemove', onMouseMove, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('touchstart', onTouch, { passive: true });
  window.addEventListener('keydown', onKeyDown, { passive: true });

  // WebGL Unmasked GPU Renderer
  function getGpuInfo() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return { vendor: 'No WebGL', renderer: 'No WebGL' };

      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (!debugInfo) {
        return {
          vendor: gl.getParameter(gl.VENDOR) || 'Unknown',
          renderer: gl.getParameter(gl.RENDERER) || 'Unknown'
        };
      }

      return {
        vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || 'Unknown',
        renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'Unknown'
      };
    } catch (e) {
      return { vendor: 'Error', renderer: 'Error' };
    }
  }

  // Automation Artifacts
  function scanAutomationArtifacts() {
    const artifacts = [];
    const suspiciousKeys = [
      'webdriver', '__webdriver_evaluate', '__selenium_evaluate',
      '__webdriver_script_fn', '__driver_evaluate', '__webdriver_unwrapped',
      '__puppeteer_evaluation_script__', '_phantom', 'callPhantom',
      '__nightmare', '_selenium'
    ];

    for (const key of suspiciousKeys) {
      if (key in window) artifacts.push(key);
    }

    for (const prop in document) {
      if (prop.startsWith('cdc_') || prop.startsWith('$cdc_')) {
        artifacts.push(`doc.${prop}`);
      }
    }

    return artifacts;
  }

  // Direct Client-Side IP & Timezone Verification
  async function checkClientNetwork() {
    try {
      const res = await fetch('https://ipwho.is/', { cache: 'no-store' });
      const data = await res.json();
      if (!data || data.success === false) return null;

      const conn = data.connection || {};
      const tz = data.timezone || {};

      let vpnDetected = false;
      let reason = '';

      // Check Timezone Offset discrepancy (browser vs IP location)
      const browserOffsetSec = -1 * new Date().getTimezoneOffset() * 60;
      const ipOffsetSec = tz.offset;

      if (ipOffsetSec !== undefined) {
        const diffSec = Math.abs(browserOffsetSec - ipOffsetSec);
        if (diffSec > 1800) {
          vpnDetected = true;
          reason = `Browser timezone does not match IP timezone (diff ${(diffSec/3600).toFixed(1)} hrs)`;
        }
      }

      // Check ISP keywords (specific VPN providers only)
      const ispStr = ((conn.isp || '') + ' ' + (conn.org || '')).toLowerCase();
      const badKw = ['datacamp', 'm247', 'nordvpn', 'surfshark', 'expressvpn', 'protonvpn', 'mullvad', 'ipvanish', 'cyberghost', 'leaseweb', 'choopa', 'vultr', 'digitalocean', 'hetzner', 'linode', 'ovh'];
      for (const kw of badKw) {
        if (ispStr.includes(kw)) {
          vpnDetected = true;
          reason = `VPN/Hosting provider detected: ${kw}`;
          break;
        }
      }

      return {
        clientVpnDetected: vpnDetected,
        clientVpnReason: reason,
        clientReportedIp: data.ip,
        clientIsp: conn.isp,
        clientAsn: conn.asn
      };
    } catch (e) {
      return null;
    }
  }

  // Collect full client fingerprint
  async function collectFingerprint() {
    const gpu = getGpuInfo();
    const artifacts = scanAutomationArtifacts();
    const isChrome = !!window.chrome && (!!window.chrome.webstore || !!window.chrome.runtime || !!window.chrome.loadTimes);
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent) || ('ontouchstart' in window && screen.width <= 1024);
    const networkCheck = await checkClientNetwork();

    return {
      webdriver: !!navigator.webdriver,
      automationArtifacts: artifacts,
      gpuVendor: gpu.vendor,
      gpuRenderer: gpu.renderer,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      timezoneOffset: new Date().getTimezoneOffset(),
      screenWidth: screen.width || 0,
      screenHeight: screen.height || 0,
      colorDepth: screen.colorDepth || 0,
      windowWidth: window.innerWidth || 0,
      windowHeight: window.innerHeight || 0,
      languages: navigator.languages ? Array.from(navigator.languages) : [navigator.language || ''],
      pluginsLength: navigator.plugins ? navigator.plugins.length : 0,
      isChrome: isChrome,
      isMobile: isMobile,
      clientVpnDetected: networkCheck ? networkCheck.clientVpnDetected : false,
      clientVpnReason: networkCheck ? networkCheck.clientVpnReason : '',
      clientReportedIp: networkCheck ? networkCheck.clientReportedIp : '',
      interaction: {
        mouseMoves: mouseMoves,
        scrolls: scrolls,
        touches: touches,
        keys: keys,
        dwellTimeMs: Date.now() - startTime
      }
    };
  }

  // Execute verification request
  async function runVerification() {
    if (verified) return;

    const fp = await collectFingerprint();

    // If client-side check already flagged VPN, redirect immediately to safe page
    if (fp.clientVpnDetected) {
      console.warn('[BotShield] Proxy/VPN detected by client inspection:', fp.clientVpnReason);
      window.location.href = '/safe-article';
      return;
    }

    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint: fp })
      });

      const data = await res.json();

      if (data.status === 'ALLOW') {
        verified = true;
        if (data.mode === 'direct_link' && data.directLinkUrl) {
          window.location.href = data.directLinkUrl;
          return;
        }

        if (window.location.pathname === '/' || window.location.pathname === '/gate') {
          sessionStorage.setItem('botshield_token', data.token);
          window.location.href = `/monetized?token=${encodeURIComponent(data.token)}`;
          return;
        }
      } else {
        console.warn('[BotShield] Blocked. Redirecting to safe decoy.');
        window.location.href = '/safe-article';
      }
    } catch (err) {
      console.error('[BotShield] Verification error:', err);
      window.location.href = '/safe-article';
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(runVerification, 500);
  });

  window.BotShield = { verify: runVerification };
})();
