// Tab Navigation
function showTab(tabName) {
  document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav li a').forEach(el => el.classList.remove('active'));

  const targetPane = document.getElementById(`tab-${tabName}`);
  if (targetPane) targetPane.classList.add('active');

  const navLink = document.querySelector(`.nav li a[href="#${tabName}"]`);
  if (navLink) navLink.classList.add('active');
}

// Fetch stats and config
async function fetchData() {
  try {
    const [statsRes, configRes] = await Promise.all([
      fetch('/api/admin/stats'),
      fetch('/api/admin/config')
    ]);

    const statsData = await statsRes.json();
    const configData = await configRes.json();

    if (statsData.success) {
      updateStatsUI(statsData.stats, statsData.logs);
    }

    if (configData.success) {
      updateConfigUI(configData.config);
    }
  } catch (err) {
    console.error('Failed to load admin data:', err);
  }
}

function updateStatsUI(stats, logs) {
  document.getElementById('stat-total').textContent = stats.totalRequests || 0;
  document.getElementById('stat-humans').textContent = stats.humansAllowed || 0;
  document.getElementById('stat-bots').textContent = stats.botsBlocked || 0;
  document.getElementById('stat-vpns').textContent = stats.vpnsBlocked || 0;
  document.getElementById('stat-tz').textContent = stats.timezoneMismatches || 0;

  const tbody = document.getElementById('logs-tbody');
  if (!logs || logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #64748b; padding: 24px;">No visitor logs yet. Visit the gate page to test.</td></tr>';
    return;
  }

  tbody.innerHTML = logs.map(log => {
    const isAllow = log.action === 'ALLOW';
    const badgeClass = isAllow ? 'verdict-allow' : 'verdict-block';
    const dateStr = new Date(log.timestamp).toLocaleTimeString();
    const reasons = log.reasons && log.reasons.length > 0 ? log.reasons.join(' • ') : 'Clean Human Traffic';

    return `
      <tr>
        <td style="color: #94a3b8; font-family: monospace;">${dateStr}</td>
        <td style="font-family: monospace; font-weight: 600;">${escapeHtml(log.ip)}</td>
        <td>${escapeHtml(log.country)} (${escapeHtml(log.city)})</td>
        <td style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(log.isp)}</td>
        <td style="font-size: 12px; font-family: monospace;">${escapeHtml(log.clientTimezone)} <span style="color: #64748b;">vs</span> ${escapeHtml(log.ipTimezone)}</td>
        <td><span class="verdict-badge ${badgeClass}">${log.action}</span></td>
        <td style="color: ${isAllow ? '#34d399' : '#f87171'}; font-size: 12px;">${escapeHtml(reasons)}</td>
      </tr>
    `;
  }).join('');
}

function updateConfigUI(config) {
  // Populate Adsterra fields
  if (config.adsterra) {
    document.getElementById('ad-mode').value = config.adsterra.mode || 'banner_and_socialbar';
    document.getElementById('ad-direct-link').value = config.adsterra.directLinkUrl || '';
    document.getElementById('ad-socialbar').value = config.adsterra.socialBarScript || '';
    document.getElementById('ad-popunder').value = config.adsterra.popunderScript || '';
    document.getElementById('ad-728').value = config.adsterra.banner728x90 || '';
    document.getElementById('ad-300').value = config.adsterra.banner300x250 || '';
  }

  // Populate Security Toggles
  if (config.security) {
    document.getElementById('sec-datacenter').checked = !!config.security.blockDatacenter;
    document.getElementById('sec-vpn').checked = !!config.security.blockVpnAndProxy;
    document.getElementById('sec-tz').checked = !!config.security.blockTimezoneMismatch;
    document.getElementById('sec-headless').checked = !!config.security.blockHeadlessBrowsers;
    document.getElementById('sec-gpu').checked = !!config.security.blockVmGpuRenderers;
    document.getElementById('sec-human').checked = !!config.security.requireHumanInteraction;
    document.getElementById('sec-proxycheck-key').value = config.security.proxyCheckApiKey || '';
  }
}

// Save Adsterra settings
async function saveAdsterraSettings(e) {
  e.preventDefault();

  const payload = {
    adsterra: {
      mode: document.getElementById('ad-mode').value,
      directLinkUrl: document.getElementById('ad-direct-link').value.trim(),
      socialBarScript: document.getElementById('ad-socialbar').value.trim(),
      popunderScript: document.getElementById('ad-popunder').value.trim(),
      banner728x90: document.getElementById('ad-728').value.trim(),
      banner300x250: document.getElementById('ad-300').value.trim()
    }
  };

  try {
    const res = await fetch('/api/admin/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      alert('Adsterra settings successfully saved!');
    } else {
      alert('Error saving settings: ' + data.message);
    }
  } catch (err) {
    alert('Failed to connect to server: ' + err.message);
  }
}

// Save Security settings
async function saveSecuritySettings(e) {
  e.preventDefault();

  const payload = {
    security: {
      blockDatacenter: document.getElementById('sec-datacenter').checked,
      blockVpnAndProxy: document.getElementById('sec-vpn').checked,
      blockTimezoneMismatch: document.getElementById('sec-tz').checked,
      blockHeadlessBrowsers: document.getElementById('sec-headless').checked,
      blockVmGpuRenderers: document.getElementById('sec-gpu').checked,
      requireHumanInteraction: document.getElementById('sec-human').checked,
      proxyCheckApiKey: document.getElementById('sec-proxycheck-key').value.trim()
    }
  };

  try {
    const res = await fetch('/api/admin/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      alert('Security rules updated successfully!');
    } else {
      alert('Error saving security rules: ' + data.message);
    }
  } catch (err) {
    alert('Failed to connect to server: ' + err.message);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Auto-refresh stats every 4 seconds
window.addEventListener('DOMContentLoaded', () => {
  fetchData();
  setInterval(fetchData, 4000);
});
