const express = require('express');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const ipIntel = require('./services/ipIntel');
const securityValidator = require('./services/securityValidator');
const statsStore = require('./services/statsStore');

const CONFIG_PATH = path.join(__dirname, 'config.json');

// Helper to read configuration safely
function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading config.json:', e.message);
    return {};
  }
}

// Helper to persist configuration safely
function saveConfig(newConfig) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('Error saving config.json:', e.message);
    return false;
  }
}

let config = loadConfig();
const app = express();

// Enable trust proxy for Render / Cloudflare
app.set('trust proxy', true);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve static assets (CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));

// 1. GATE CHECKPOINT (Entry point for all visitors)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'gate.html'));
});

app.get('/gate', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'gate.html'));
});

// 2. SAFE DECOY PAGE (Shown to bots, crawlers, and VPNs - ZERO Adsterra ads)
app.get('/safe-article', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'safe-decoy.html'));
});

// Policy and Compliance Pages
app.get('/privacy', (req, res) => res.sendFile(path.join(__dirname, 'views', 'privacy.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(__dirname, 'views', 'terms.html')));
app.get('/dmca', (req, res) => res.sendFile(path.join(__dirname, 'views', 'dmca.html')));
app.get('/2257', (req, res) => res.sendFile(path.join(__dirname, 'views', '2257.html')));
app.get('/contact', (req, res) => res.sendFile(path.join(__dirname, 'views', 'contact.html')));

// 3. MONETIZED HUMAN PAGE (Accessible with valid signed verification token)
app.get('/monetized', (req, res) => {
  const token = req.query.token || req.cookies.botshield_token;
  const secretKey = process.env.SECRET_KEY || config.site.secretKey || 'default-secret';

  // If token is missing or invalid, route to safe decoy
  if (!token || !securityValidator.verifyToken(token, secretKey, config.site.verificationTimeoutSeconds || 300)) {
    console.log(`[BotShield] Monetized page rejected: invalid or missing session token`);
    return res.redirect('/safe-article?reason=invalid_session');
  }

  res.sendFile(path.join(__dirname, 'views', 'video-portal.html'));
});

// 4. API: VERIFY VISITOR (Evaluates IP intelligence, fingerprint, timezone & GPU)
app.post('/api/verify', async (req, res) => {
  try {
    const clientIp = ipIntel.getClientIp(req);
    const fingerprint = req.body.fingerprint || {};

    // 1. IP Threat Intelligence Lookup
    const intel = await ipIntel.lookupIp(clientIp, config);

    // 2. Validate full visitor profile against security policies
    const validation = securityValidator.validateVisitor({
      ipIntel: intel,
      fingerprint: fingerprint,
      config: config
    });

    console.log(`[BotShield] IP: ${clientIp} | ISP: ${intel.isp} | Mobile: ${!!fingerprint.isMobile} | Action: ${validation.action} | Reasons:`, validation.reasons);

    // 3. Log visit in stats store
    statsStore.recordVisit({
      ip: clientIp,
      country: intel.country,
      city: intel.city,
      isp: intel.isp,
      isDatacenter: intel.isDatacenter,
      isVpn: intel.isVpn,
      isBot: validation.isBot,
      reasons: validation.reasons,
      action: validation.action,
      userAgent: req.headers['user-agent'],
      clientTimezone: fingerprint.timezone,
      ipTimezone: intel.timezone,
      gpuRenderer: fingerprint.gpuRenderer
    });

    if (validation.passed) {
      const secretKey = process.env.SECRET_KEY || config.site.secretKey || 'default-secret';
      const token = securityValidator.generateToken(secretKey);

      res.cookie('botshield_token', token, {
        httpOnly: false,
        maxAge: (config.site.verificationTimeoutSeconds || 300) * 1000,
        sameSite: 'lax'
      });

      return res.json({
        status: 'ALLOW',
        token: token,
        mode: config.adsterra.mode || 'banner_and_socialbar',
        directLinkUrl: config.adsterra.directLinkUrl || '',
        ads: config.adsterra
      });
    } else {
      const reasonStr = validation.reasons.join(' | ');
      return res.json({
        status: 'BLOCK',
        redirect: `/safe-article?reason=${encodeURIComponent(reasonStr)}`,
        reasons: validation.reasons
      });
    }
  } catch (err) {
    console.error('Error during verification:', err);
    return res.json({ status: 'BLOCK', redirect: '/safe-article?reason=error' });
  }
});

// 5. API: SECURE AD PAYLOAD (Only returns Adsterra scripts if token is verified)
app.get('/api/ad-payload', (req, res) => {
  const token = req.query.token || req.cookies.botshield_token;
  const secretKey = process.env.SECRET_KEY || config.site.secretKey || 'default-secret';

  const isValid = securityValidator.verifyToken(
    token,
    secretKey,
    config.site.verificationTimeoutSeconds || 300
  );

  if (!isValid) {
    return res.status(403).json({ success: false, message: 'Invalid or expired session' });
  }

  // Reload latest config to reflect any admin changes
  config = loadConfig();
  res.json({
    success: true,
    ads: config.adsterra
  });
});

// Start Express Server
const PORT = process.env.PORT || config.site.port || 3000;
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🛡️  BotShield & Video Portal is running!`);
  console.log(`📍 Public Visitor Gate: http://localhost:${PORT}`);
  console.log(`🛡️  Safe Decoy Page (Zero Ads): http://localhost:${PORT}/safe-article`);
  console.log(`=======================================================`);
});
