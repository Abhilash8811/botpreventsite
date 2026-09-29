/**
 * IPFighter Shield - Deep Browser Fingerprinting & Anti-Bot Defense
 * Protects Adsterra accounts by filtering out Bots, Headless Browsers, Datacenters & VPNs.
 */
(function() {
  'use strict';

  const startTime = Date.now();
  let mouseMoves = 0;
  let scrolls = 0;
  let touches = 0;
  let keys = 0;
  let lastMoveTime = 0;
  let verified = false;

  // Track human interaction events
  function onMouseMove() {
    mouseMoves++;
    lastMoveTime = Date.now();
  }

  function onScroll() {
    scrolls++;
  }

  function onTouch() {
    touches++;
  }

  function onKeyDown() {
    keys++;
  }

  window.addEventListener('mousemove', onMouseMove, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('touchstart', onTouch, { passive: true });
  window.addEventListener('keydown', onKeyDown, { passive: true });

  // WebGL Unmasked GPU Renderer Detector (Detects VMs & Headless Chrome SwiftShader)
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

  // Automation Artifact Scanner
  function scanAutomationArtifacts() {
    const artifacts = [];

    // Puppeteer / Selenium / Chromedriver hooks
    const suspiciousKeys = [
      'webdriver',
      '__webdriver_evaluate',
      '__selenium_evaluate',
      '__webdriver_script_fn',
      '__driver_evaluate',
      '__webdriver_unwrapped',
      '__fxdriver_evaluate',
      '__driver_unwrapped',
      '__puppeteer_evaluation_script__',
      '_phantom',
      'callPhantom',
      '__nightmare',
      '_selenium'
    ];

    for (const key of suspiciousKeys) {
      if (key in window) {
        artifacts.push(key);
      }
    }

    // Check document for cdc_ attributes
    for (const prop in document) {
      if (prop.startsWith('cdc_') || prop.startsWith('$cdc_')) {
        artifacts.push(`doc.${prop}`);
      }
    }

    // Check window properties for cdc_
    for (const prop in window) {
      if (prop.startsWith('cdc_') || prop.startsWith('$cdc_')) {
        artifacts.push(`win.${prop}`);
      }
    }

    return artifacts;
  }

  // Canvas fingerprint hash
  function getCanvasHash() {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 50;
      const ctx = canvas.getContext('2d');
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('AdsterraSafeCheck,123!', 2, 15);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('AdsterraSafeCheck,123!', 4, 17);
      const dataUrl = canvas.toDataURL();
      
      let hash = 0;
      for (let i = 0; i < dataUrl.length; i++) {
        hash = ((hash << 5) - hash) + dataUrl.charCodeAt(i);
        hash |= 0;
      }
      return hash.toString(16);
    } catch (e) {
      return 'canvas_error';
    }
  }

  // Collect full client fingerprint
  function collectFingerprint() {
    const gpu = getGpuInfo();
    const artifacts = scanAutomationArtifacts();
    const isChrome = !!window.chrome && (!!window.chrome.webstore || !!window.chrome.runtime || !!window.chrome.loadTimes);

    return {
      webdriver: !!navigator.webdriver,
      automationArtifacts: artifacts,
      gpuVendor: gpu.vendor,
      gpuRenderer: gpu.renderer,
      canvasHash: getCanvasHash(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      timezoneOffset: new Date().getTimezoneOffset(),
      screenWidth: screen.width || 0,
      screenHeight: screen.height || 0,
      colorDepth: screen.colorDepth || 0,
      windowWidth: window.innerWidth || 0,
      windowHeight: window.innerHeight || 0,
      pixelRatio: window.devicePixelRatio || 1,
      languages: navigator.languages ? Array.from(navigator.languages) : [navigator.language || ''],
      pluginsLength: navigator.plugins ? navigator.plugins.length : 0,
      hardwareConcurrency: navigator.hardwareConcurrency || 0,
      isChrome: isChrome,
      interaction: {
        mouseMoves: mouseMoves,
        scrolls: scrolls,
        touches: touches,
        keys: keys,
        dwellTimeMs: Date.now() - startTime
      }
    };
  }

  // Inject Adsterra ads dynamically into container elements
  function injectAdsterraAds(ads) {
    if (!ads) return;

    // 1. Social Bar script
    if (ads.socialBarScript && ads.socialBarScript.trim().startsWith('<script')) {
      const temp = document.createElement('div');
      temp.innerHTML = ads.socialBarScript;
      const scripts = temp.querySelectorAll('script');
      scripts.forEach(s => {
        const newScript = document.createElement('script');
        if (s.src) newScript.src = s.src;
        if (s.innerHTML) newScript.innerHTML = s.innerHTML;
        if (s.type) newScript.type = s.type;
        document.body.appendChild(newScript);
      });
    }

    // 2. Popunder script
    if (ads.popunderScript && ads.popunderScript.trim().startsWith('<script')) {
      const temp = document.createElement('div');
      temp.innerHTML = ads.popunderScript;
      const scripts = temp.querySelectorAll('script');
      scripts.forEach(s => {
        const newScript = document.createElement('script');
        if (s.src) newScript.src = s.src;
        if (s.innerHTML) newScript.innerHTML = s.innerHTML;
        document.body.appendChild(newScript);
      });
    }

    // 3. 728x90 Banner
    const container728 = document.getElementById('ad-slot-728');
    if (container728 && ads.banner728x90) {
      container728.innerHTML = ads.banner728x90;
      executeInlineScripts(container728);
    }

    // 4. 300x250 Banner
    const container300 = document.getElementById('ad-slot-300');
    if (container300 && ads.banner300x250) {
      container300.innerHTML = ads.banner300x250;
      executeInlineScripts(container300);
    }
  }

  function executeInlineScripts(el) {
    const scripts = el.querySelectorAll('script');
    scripts.forEach(s => {
      const newScript = document.createElement('script');
      if (s.src) newScript.src = s.src;
      if (s.innerHTML) newScript.innerHTML = s.innerHTML;
      if (s.type) newScript.type = s.type;
      s.parentNode.replaceChild(newScript, s);
    });
  }

  // Execute verification request
  async function runVerification() {
    if (verified) return;

    const fp = collectFingerprint();

    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint: fp })
      });

      const data = await res.json();

      if (data.status === 'ALLOW') {
        verified = true;
        // If mode is Direct Link redirect
        if (data.mode === 'direct_link' && data.directLinkUrl) {
          window.location.href = data.directLinkUrl;
          return;
        }

        // If on the gate checkpoint page, proceed to monetized page
        if (window.location.pathname === '/' || window.location.pathname === '/gate') {
          sessionStorage.setItem('botshield_token', data.token);
          window.location.href = `/monetized?token=${encodeURIComponent(data.token)}`;
          return;
        }

        // If already on monetized page, inject ads
        if (data.ads) {
          injectAdsterraAds(data.ads);
        }
      } else {
        // Blocked: silently redirect to safe article decoy
        console.warn('[BotShield] Security verification notice.');
        window.location.href = '/safe-article';
      }
    } catch (err) {
      console.error('[BotShield] Verification error:', err);
      // Fail closed to safe page
      window.location.href = '/safe-article';
    }
  }

  // Wait 600ms to allow natural human mouse movement or touch, then verify
  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(runVerification, 700);
  });

  // Expose manual trigger if needed
  window.BotShield = {
    verify: runVerification,
    getFingerprint: collectFingerprint
  };
})();
