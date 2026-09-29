/**
 * YouTube-Style Video Portal Controller
 * Loads static JSON data, renders video grid, video player & secure Adsterra ads
 */
let allVideos = [];
let filteredVideos = [];
let currentCategory = 'All';

// Format seconds into MM:SS or HH:MM:SS
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// Format views into human readable (e.g. 1.2K, 350K, 1.5M)
function formatViews(views) {
  if (!views) return '1.2K views';
  if (views >= 1000000) return (views / 1000000).toFixed(1) + 'M views';
  if (views >= 1000) return (views / 1000).toFixed(1) + 'K views';
  return `${views} views`;
}

// Load videos from static JSON file
async function loadVideosData() {
  try {
    const res = await fetch('/data/videos.json');
    if (!res.ok) throw new Error('Failed to load videos.json');
    allVideos = await res.json();
    filteredVideos = allVideos;
    
    buildCategoryChips();
    checkRoute();
  } catch (err) {
    console.error('Error loading video database:', err);
    document.getElementById('video-grid').innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #ef4444;">
        Failed to load video library. Please check if public/data/videos.json exists.
      </div>
    `;
  }
}

// Build category filter chips dynamically
function buildCategoryChips() {
  const categoriesSet = new Set(['All', 'Trending', 'Popular']);
  allVideos.slice(0, 50).forEach(v => {
    if (v.categories && Array.isArray(v.categories)) {
      v.categories.forEach(c => {
        if (c && typeof c === 'string' && c.length < 20) {
          categoriesSet.add(c);
        }
      });
    }
  });

  const chipsContainer = document.getElementById('chips-bar');
  if (!chipsContainer) return;

  const chips = Array.from(categoriesSet).slice(0, 15);
  chipsContainer.innerHTML = chips.map(cat => `
    <button class="yt-chip ${cat === currentCategory ? 'active' : ''}" onclick="filterCategory('${escapeHtml(cat)}')">
      ${escapeHtml(cat)}
    </button>
  `).join('');
}

// Filter videos by category
function filterCategory(cat) {
  currentCategory = cat;
  buildCategoryChips();

  if (cat === 'All') {
    filteredVideos = allVideos;
  } else if (cat === 'Popular' || cat === 'Trending') {
    filteredVideos = [...allVideos].sort((a, b) => (b.views || 0) - (a.views || 0));
  } else {
    filteredVideos = allVideos.filter(v => v.categories && v.categories.includes(cat));
  }

  renderGrid(filteredVideos);
}

// Search handler
function onSearchInput(query) {
  const q = query.trim().toLowerCase();
  if (!q) {
    filteredVideos = allVideos;
  } else {
    filteredVideos = allVideos.filter(v => 
      (v.title && v.title.toLowerCase().includes(q)) ||
      (v.categories && v.categories.some(c => c.toLowerCase().includes(q)))
    );
  }
  renderGrid(filteredVideos);
}

// Render video grid
function renderGrid(videos) {
  const container = document.getElementById('video-grid');
  const browseView = document.getElementById('browse-view');
  const watchView = document.getElementById('watch-view');

  if (browseView) browseView.style.display = 'block';
  if (watchView) watchView.style.display = 'none';

  if (!videos || videos.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 60px; color: #888;">
        No videos found matching your search.
      </div>
    `;
    return;
  }

  // Display top 60 videos on current page
  const displayList = videos.slice(0, 60);

  container.innerHTML = displayList.map(v => {
    const thumb = v.thumbnail || '/images/default-thumb.jpg';
    const initial = v.title ? v.title.charAt(0).toUpperCase() : 'V';
    const dur = formatDuration(v.duration);
    const viewsStr = formatViews(v.views);

    return `
      <div class="yt-card" onclick="openWatch(${v.id})">
        <div class="yt-thumb-wrapper">
          <img class="yt-thumb" src="${escapeHtml(thumb)}" alt="${escapeHtml(v.title)}" loading="lazy" onerror="this.src='https://picsum.photos/320/180?grayscale'">
          <span class="yt-duration-badge">${dur}</span>
        </div>
        <div class="yt-card-info">
          <div class="yt-channel-avatar">${initial}</div>
          <div class="yt-meta">
            <div class="yt-title" title="${escapeHtml(v.title)}">${escapeHtml(v.title)}</div>
            <div class="yt-submeta">${viewsStr} • Verified HD</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Open Video Player Watch View
function openWatch(videoId) {
  const video = allVideos.find(v => v.id === videoId);
  if (!video) return;

  window.location.hash = `watch?id=${videoId}`;

  const browseView = document.getElementById('browse-view');
  const watchView = document.getElementById('watch-view');

  browseView.style.display = 'none';
  watchView.style.display = 'grid';

  // Set Player source
  const player = document.getElementById('main-player');
  player.src = video.streamUrl;
  player.poster = video.thumbnail || '';
  player.play().catch(() => { /* Autoplay block catch */ });

  // Set title & meta
  document.getElementById('watch-title').textContent = video.title;
  document.getElementById('watch-views').textContent = formatViews(video.views) + ' • Verified Stream';

  // Render recommended videos sidebar
  renderRecommendations(videoId);

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Render recommendations in watch sidebar
function renderRecommendations(currentId) {
  const recContainer = document.getElementById('recommended-list');
  const recs = allVideos.filter(v => v.id !== currentId).slice(0, 15);

  recContainer.innerHTML = recs.map(v => `
    <div class="yt-rec-card" onclick="openWatch(${v.id})">
      <div class="yt-rec-thumb-wrapper">
        <img style="width:100%;height:100%;object-fit:cover;" src="${escapeHtml(v.thumbnail)}" onerror="this.src='https://picsum.photos/140/80?grayscale'">
        <span class="yt-duration-badge">${formatDuration(v.duration)}</span>
      </div>
      <div class="yt-rec-meta">
        <div class="yt-rec-title" title="${escapeHtml(v.title)}">${escapeHtml(v.title)}</div>
        <div class="yt-submeta">${formatViews(v.views)}</div>
      </div>
    </div>
  `).join('');
}

// Route checking (browser back/forward button or direct hash)
function checkRoute() {
  const hash = window.location.hash;
  if (hash.startsWith('#watch?id=')) {
    const id = parseInt(hash.replace('#watch?id=', ''), 10);
    if (!isNaN(id)) {
      openWatch(id);
      return;
    }
  }

  // Otherwise show browse grid
  renderGrid(filteredVideos);
}

window.addEventListener('hashchange', checkRoute);

// Dynamic Adsterra Secure Ad Delivery
async function loadSecureAdsterraAds() {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token') || sessionStorage.getItem('botshield_token');

  if (!token) {
    // If not verified yet, send to gate check
    window.location.href = '/';
    return;
  }

  try {
    const res = await fetch(`/api/ad-payload?token=${encodeURIComponent(token)}`);
    const data = await res.json();

    if (!data.success) {
      window.location.href = '/safe-article';
      return;
    }

    const ads = data.ads;
    if (!ads) return;

    // Inject Top 728x90 Banner
    const slot728 = document.getElementById('ad-slot-728');
    if (slot728 && ads.banner728x90) {
      slot728.innerHTML = ads.banner728x90;
      executeScripts(slot728);
    }

    // Inject Sidebar 300x250 Banner
    const slot300 = document.getElementById('ad-slot-300');
    if (slot300 && ads.banner300x250) {
      slot300.innerHTML = ads.banner300x250;
      executeScripts(slot300);
    }

    // Inject Social Bar
    if (ads.socialBarScript && ads.socialBarScript.includes('<script')) {
      appendScript(ads.socialBarScript);
    }

    // Inject Popunder
    if (ads.popunderScript && ads.popunderScript.includes('<script')) {
      appendScript(ads.popunderScript);
    }
  } catch (err) {
    console.error('Failed to load secure ads:', err);
  }
}

function appendScript(htmlSnippet) {
  const div = document.createElement('div');
  div.innerHTML = htmlSnippet;
  const scripts = div.querySelectorAll('script');
  scripts.forEach(s => {
    const newScript = document.createElement('script');
    if (s.src) newScript.src = s.src;
    if (s.innerHTML) newScript.innerHTML = s.innerHTML;
    if (s.type) newScript.type = s.type;
    document.body.appendChild(newScript);
  });
}

function executeScripts(el) {
  const scripts = el.querySelectorAll('script');
  scripts.forEach(s => {
    const newScript = document.createElement('script');
    if (s.src) newScript.src = s.src;
    if (s.innerHTML) newScript.innerHTML = s.innerHTML;
    if (s.type) newScript.type = s.type;
    s.parentNode.replaceChild(newScript, s);
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

window.addEventListener('DOMContentLoaded', () => {
  loadVideosData();
  loadSecureAdsterraAds();
});
