# 🛡️ BotShield - Adsterra Anti-Bot & Anti-VPN Traffic Gateway

A high-performance security cloaking and traffic hygiene gateway specifically engineered to **protect Adsterra publisher accounts from bans** caused by invalid bot traffic, datacenter proxies, commercial VPNs, and headless browser scrapers.

Inspired by **IPFighter** and enterprise fraud-detection systems, BotShield enforces a multi-layer verification funnel before any Adsterra ad codes or direct links are triggered.

---

## 🎯 The Core Problem & Solution

### Why Adsterra Bans Publishers:
- **Datacenter IPs**: Clicks or impressions from AWS, DigitalOcean, Hetzner, Linode, OVH, or commercial VPNs (NordVPN, ExpressVPN) are automatically marked as Invalid Traffic (IVT) by Adsterra’s anti-fraud partners (FraudScore, Spider AF).
- **Headless Browsers**: Bots run automated Chrome (Puppeteer / Playwright / Selenium) with `navigator.webdriver = true` and software GPU renderers (`SwiftShader`, `llvmpipe`).
- **Timezone Mismatch**: A user whose IP geolocates in New York but whose browser clock is set to Moscow or India is flagged as a proxy/VPN.
- **Immediate Clicks**: Bots trigger popunders or ad impressions in <200ms with zero natural mouse or touch entropy.

### The BotShield Defense Architecture:
```
[ Incoming Visitor ]
         │
         ▼
[ IP Intelligence Check ]
   ├── Datacenter ASN (AWS, DO, Hetzner, OVH, etc.) → [ BLOCK ] ──┐
   ├── Commercial VPN / Proxy / Tor detected       → [ BLOCK ] ──┤
   └── Timezone Mismatch (IP vs Browser Clock)      → [ BLOCK ] ──┤
         │                                                        │
         ▼ (IP Clean)                                             │
[ Client Fingerprint & Bot Check ]                                │
   ├── navigator.webdriver == true                 → [ BLOCK ] ──┤
   ├── Headless GPU (SwiftShader / llvmpipe / VM)  → [ BLOCK ] ──┤
   ├── Zero Plugins / Automation Hooks (cdc_, etc) → [ BLOCK ] ──┤
   └── Zero Human Interaction / Instant script     → [ BLOCK ] ──┤
         │                                                        │
         ▼ (All Checks Passed)                                    ▼
[ Real Human Verified ]                                  [ SAFE DECOY PAGE ]
✅ Dynamically Injects Adsterra Ads                      ⛔ ZERO ADSTERRA ADS
   • Social Bar Script                                      • Clean blog article
   • Popunder Script                                        • No ad network requests
   • 728x90 & 300x250 Banners                               • Safe for compliance bots
   • Or Direct Link Redirect
```

---

## 🚀 Quick Start (Local Run)

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Start the Gateway**:
   ```bash
   node server.js
   ```

3. **Access the Interfaces**:
   - **Public Visitor Gate**: [http://localhost:3000](http://localhost:3000) (Simulates incoming traffic)
   - **Admin & Traffic Dashboard**: [http://localhost:3000/admin](http://localhost:3000/admin) (Live analytics & settings)
   - **Safe Decoy Page**: [http://localhost:3000/safe-article](http://localhost:3000/safe-article) (Clean fallback article)

---

## ⚙️ Configuration

You can configure settings via **[http://localhost:3000/admin](http://localhost:3000/admin)** or directly in `config.json`:

### 1. Adsterra Ad Codes
- **Mode**: Choose between `On-Page Ads (Banners, Social Bar, Popunder)` or `Adsterra Direct Link (Instant Safe Redirect)`.
- **Direct Link URL**: Your Adsterra SmartLink URL.
- **Social Bar**: Paste your script from the Adsterra dashboard.
- **Popunder**: Paste your script from the Adsterra dashboard.
- **728x90 / 300x250 Banners**: Paste your banner placement codes.

### 2. Security Rules
- **Block Datacenter & Cloud Hosting IPs**: Blocks AWS, Google Cloud, Azure, DigitalOcean, Hetzner, Linode, Contabo, Vultr, etc.
- **Block VPNs & Commercial Proxies**: Blocks NordVPN, ExpressVPN, Surfshark, Tor exit nodes, and known proxies.
- **Block Timezone Geolocation Mismatch**: Replicates IPFighter’s detection of spoofed locations.
- **Block Headless Browsers**: Blocks Puppeteer, Playwright, Selenium, and chromedriver signatures.
- **Block Virtual Machine GPUs**: Blocks `SwiftShader`, `llvmpipe`, `Mesa`, `VMware`, and `VirtualBox`.
- **Require Human Interaction**: Ensures non-zero mouse movement, scroll, or touch entropy.
- **ProxyCheck.io API Key** *(Optional)*: Enter a free API key from [proxycheck.io](https://proxycheck.io) for enhanced real-time residential proxy scoring (1,000 free queries/day).

---

## ☁️ Deployment Best Practices

### Recommended: Cloudflare Edge + BotShield
To maximize protection at zero cost:
1. Place your domain behind **Cloudflare (Free plan)**.
2. In Cloudflare Dashboard:
   - Go to **Security → Bots** and enable **Bot Fight Mode**.
   - Go to **Security → WAF → Custom Rules**:
     - Action: *Managed Challenge*
     - Field: `Threat Score > 15` OR `AS Num in {16509, 14618, 15169, 8075, 14061, 24940, 16276}`
3. Deploy this Node.js app to **Render.com**, **Railway.app**, **Vercel**, or an **Ubuntu VPS**:
   - `npm start`
4. Set your environment variables in `.env`:
   ```env
   PORT=3000
   SECRET_KEY=your-random-production-secret-key
   ADMIN_PASSWORD=your-secure-admin-password
   ```

---

## 🛡️ License
MIT License. Built for high-reputation ad traffic protection.
