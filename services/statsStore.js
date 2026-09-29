const fs = require('fs');
const path = require('path');

class StatsStore {
  constructor() {
    this.stats = {
      totalRequests: 0,
      humansAllowed: 0,
      botsBlocked: 0,
      vpnsBlocked: 0,
      timezoneMismatches: 0,
      startTime: Date.now()
    };
    this.logs = [];
    this.maxLogs = 200;
  }

  recordVisit({ ip, country, city, isp, isDatacenter, isVpn, isBot, reasons, action, userAgent, clientTimezone, ipTimezone, gpuRenderer }) {
    this.stats.totalRequests++;

    if (action === 'ALLOW') {
      this.stats.humansAllowed++;
    } else {
      if (isBot) this.stats.botsBlocked++;
      if (isVpn || isDatacenter) this.stats.vpnsBlocked++;
      if (reasons.some(r => r.toLowerCase().includes('timezone'))) {
        this.stats.timezoneMismatches++;
      }
    }

    const logEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      ip: ip || 'Unknown',
      country: country || 'Unknown',
      city: city || 'Unknown',
      isp: isp || 'Unknown',
      isDatacenter: !!isDatacenter,
      isVpn: !!isVpn,
      isBot: !!isBot,
      reasons: reasons || [],
      action: action || 'BLOCK',
      userAgent: userAgent ? userAgent.substring(0, 100) : 'Unknown',
      clientTimezone: clientTimezone || 'Unknown',
      ipTimezone: ipTimezone || 'Unknown',
      gpuRenderer: gpuRenderer || 'Unknown'
    };

    this.logs.unshift(logEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }
  }

  getStats() {
    return {
      ...this.stats,
      uptimeSeconds: Math.floor((Date.now() - this.stats.startTime) / 1000)
    };
  }

  getRecentLogs(limit = 50) {
    return this.logs.slice(0, limit);
  }

  clearLogs() {
    this.logs = [];
  }
}

module.exports = new StatsStore();
