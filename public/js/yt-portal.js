/**
 * YouTube-Style Video Portal Controller
 * Full-Viewport Heavy Ads, Dynamic Pagination, Search & Clean Player
 */
let allVideos = [];
let filteredVideos = [];
let currentCategory = 'All';
let currentPage = 1;
const ITEMS_PER_PAGE = 24;

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

// Format views into human readable
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
        Failed to load video library. Please verify public/data/videos.json.
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
  currentPage = 1;
  buildCategoryChips();

  if (cat === 'All') {
    filteredVideos = allVideos;
  } else if (cat === 'Popular' || cat === 'Trending') {
    filteredVideos = [...allVideos].sort((a, b) => (b.views || 0) - (a.views || 0));
  } else {
    filteredVideos = allVideos.filter(v => v.categories && v.categories.includes(cat));
  }

  renderGrid();
}

// Search handler
function onSearchInput(query) {
  const q = query.trim().toLowerCase();
  currentPage = 1;

  if (!q) {
    filteredVideos = allVideos;
  } else {
    filteredVideos = allVideos.filter(v => 
      (v.title && v.title.toLowerCase().includes(q)) ||
      (v.categories && v.categories.some(c => c.toLowerCase().includes(q)))
    );
  }
  renderGrid();
}

// Render video grid with Pagination
function renderGrid() {
  const container = document.getElementById('video-grid');
  const browseView = document.getElementById('browse-view');
  const watchView = document.getElementById('watch-view');
  const paginationContainer = document.getElementById('pagination');

  if (browseView) browseView.style.display = 'block';
  if (watchView) watchView.style.display = 'none';

  if (!filteredVideos || filteredVideos.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 60px; color: #888;">
        No videos found matching your query.
      </div>
    `;
    if (paginationContainer) paginationContainer.innerHTML = '';
    return;
  }

  // Calculate slice for current page
  const totalPages = Math.ceil(filteredVideos.length / ITEMS_PER_PAGE);
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const pageVideos = filteredVideos.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  container.innerHTML = pageVideos.map((v, idx) => {
    const thumb = v.thumbnail || '/images/default-thumb.jpg';
    const initial = v.title ? v.title.charAt(0).toUpperCase() : 'V';
    const dur = formatDuration(v.duration);
    const viewsStr = formatViews(v.views);

    let html = `
      <div class="yt-card" onclick="openWatch(${v.id})">
        <div class="yt-thumb-wrapper">
          <img class="yt-thumb" src="${escapeHtml(thumb)}" alt="${escapeHtml(v.title)}" loading="lazy" onerror="this.src='https://picsum.photos/320/180?grayscale'">
          <span class="yt-duration-badge">${dur}</span>
        </div>
        <div class="yt-card-info">
          <div class="yt-channel-avatar">${initial}</div>
          <div class="yt-meta">
            <div class="yt-title" title="${escapeHtml(v.title)}">${escapeHtml(v.title)}</div>
            <div class="yt-submeta">${viewsStr} • HD</div>
          </div>
        </div>
      </div>
    `;

    // In-feed Banner slot inserted after video #8 for extra CPM
    if (idx === 7) {
      html += `
        <div style="grid-column: 1/-1; margin: 16px 0; display: flex; justify-content: center; min-height: 90px;">
          <iframe src="/ad-frame.html?key=3d0468550bff36377c58d545fdd089f7&w=728&h=90" width="728" height="90" frameborder="0" scrolling="no" style="border:none; overflow:hidden; max-width:100%;"></iframe>
        </div>
      `;
    }

    return html;
  }).join('');

  renderPagination(totalPages);
}

// Render numbered pagination controls
function renderPagination(totalPages) {
  const container = document.getElementById('pagination');
  if (!container || totalPages <= 1) {
    if (container) container.innerHTML = '';
    return;
  }

  let html = '';

  // First & Prev buttons
  html += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="goToPage(1)">&laquo; First</button>`;
  html += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="goToPage(${currentPage - 1})">&lsaquo; Prev</button>`;

  // Page numbers window (e.g. current +/- 2)
  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(totalPages, currentPage + 2);

  if (startPage > 1) {
    html += `<button class="page-btn" onclick="goToPage(1)">1</button>`;
    if (startPage > 2) html += `<span style="color:#666; padding:0 4px;">...</span>`;
  }

  for (let i = startPage; i <= endPage; i++) {
    html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) html += `<span style="color:#666; padding:0 4px;">...</span>`;
    html += `<button class="page-btn" onclick="goToPage(${totalPages})">${totalPages}</button>`;
  }

  // Next & Last buttons
  html += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="goToPage(${currentPage + 1})">Next &rsaquo;</button>`;
  html += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="goToPage(${totalPages})">Last &raquo;</button>`;

  container.innerHTML = html;
}

// Navigate to specific page with smooth scroll
function goToPage(page) {
  currentPage = page;
  renderGrid();
  const gridEl = document.getElementById('browse-view');
  if (gridEl) {
    gridEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// Scroll down smoothly from the first-viewport ad wall to the video content
function scrollToVideos() {
  const el = document.getElementById('browse-view');
  if (el) {
    el.scrollIntoView({ behavior: 'smooth' });
  }
}

// Open Video Player Watch View
function openWatch(videoId) {
  const video = allVideos.find(v => v.id === videoId);
  if (!video) return;

  window.location.hash = `watch?id=${videoId}`;

  const browseView = document.getElementById('browse-view');
  const watchView = document.getElementById('watch-view');
  const adWall = document.getElementById('hero-ad-wall');

  if (adWall) adWall.style.display = 'none'; // Collapse ad wall in watch view
  if (browseView) browseView.style.display = 'none';
  if (watchView) watchView.style.display = 'grid';

  const player = document.getElementById('main-player');
  player.src = video.streamUrl;
  player.poster = video.thumbnail || '';
  player.play().catch(() => {});

  document.getElementById('watch-title').textContent = video.title;
  document.getElementById('watch-views').textContent = formatViews(video.views) + ' • Verified HD Stream';

  renderRecommendations(videoId);
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

// Route checking (hash-based)
function checkRoute() {
  const hash = window.location.hash;
  const adWall = document.getElementById('hero-ad-wall');

  if (hash.startsWith('#watch?id=')) {
    const id = parseInt(hash.replace('#watch?id=', ''), 10);
    if (!isNaN(id)) {
      openWatch(id);
      return;
    }
  }

  if (adWall) adWall.style.display = 'flex';
  renderGrid();
}

window.addEventListener('hashchange', checkRoute);

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
});
