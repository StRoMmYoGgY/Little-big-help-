// Little Big Help - AI Marketing Dashboard & Social Publishing System
// Client controller for private administrator area

let currentToken = localStorage.getItem('lbh_admin_token') || null;
let currentAdminUser = null;
let allCampaigns = [];
let activeCampaign = null;
let metaSettings = null;
let customImageObj = null;

// DOM Elements
const authScreen = document.getElementById('auth-screen');
const adminApp = document.getElementById('admin-app');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const loginSpinner = document.getElementById('login-spinner');
const btnLogin = document.getElementById('btn-login');

// Topbar & Nav
const pageTitle = document.getElementById('page-title');
const pageBreadcrumb = document.getElementById('page-breadcrumb');
const topbarMetaStatus = document.getElementById('topbar-meta-status');
const topbarMetaText = document.getElementById('topbar-meta-text');
const navMetaDot = document.getElementById('nav-meta-dot');
const globalAlertContainer = document.getElementById('global-alert-container');

// Canvas
const canvasFb = document.getElementById('banner-canvas');
const canvasIg = document.getElementById('banner-canvas-ig');

// Initialize Brand Logo for Canvas
const brandLogoImg = new Image();
brandLogoImg.src = '/assets/images/interlocking-relief-social-tile.png';
brandLogoImg.onload = () => {
  renderCanvas();
};

// ----------------- AUTHENTICATION (Priority 1) -----------------
// Centralized authenticated fetch with credentials (httpOnly cookie) and token fallback
async function authFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (currentToken) {
    headers['Authorization'] = `Bearer ${currentToken}`;
  }
  const opts = {
    ...options,
    headers,
    credentials: 'include'
  };

  const res = await fetch(url, opts);
  if (res.status === 401 && !url.includes('/api/auth/login')) {
    showAlert('Session expired or unauthorized. Please sign in again.', 'warning');
    logout();
  }
  return res;
}

async function checkAuth() {
  try {
    const headers = {};
    if (currentToken) {
      headers['Authorization'] = `Bearer ${currentToken}`;
    }
    const res = await fetch('/api/auth/me', {
      headers,
      credentials: 'include'
    });
    const data = await res.json();
    
    if (data.authenticated && data.user) {
      currentAdminUser = data.user;
      showAdminApp();
      loadInitialData();
    } else {
      window.location.href = '/admin';
    }
  } catch (err) {
    console.error('Auth verification error:', err);
    window.location.href = '/admin';
  }
}

function showAuthScreen() {
  window.location.href = '/admin';
}

function showAdminApp() {
  if (authScreen) authScreen.classList.add('hidden');
  adminApp.classList.remove('hidden');
  if (currentAdminUser) {
    document.getElementById('sidebar-user-email').textContent = currentAdminUser.email;
  }
}

function logout() {
  fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
    headers: currentToken ? { Authorization: `Bearer ${currentToken}` } : {}
  }).catch(() => {});

  currentToken = null;
  currentAdminUser = null;
  localStorage.removeItem('lbh_admin_token');
  window.location.href = '/admin';
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.classList.add('hidden');
  loginSpinner.classList.remove('hidden');
  btnLogin.disabled = true;

  const email = document.getElementById('admin-email').value;
  const passcode = document.getElementById('admin-passcode').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, passcode })
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to authenticate');
    }

    currentToken = data.token;
    currentAdminUser = data.user;
    if (currentToken) {
      localStorage.setItem('lbh_admin_token', currentToken);
    }
    showAdminApp();
    loadInitialData();
    showAlert('Welcome, Administrator! You are securely authenticated.', 'success');
  } catch (err) {
    loginError.textContent = err.message;
    loginError.classList.remove('hidden');
  } finally {
    loginSpinner.classList.add('hidden');
    btnLogin.disabled = false;
  }
});

document.getElementById('btn-logout').addEventListener('click', logout);

// ----------------- NAVIGATION & TABS -----------------
const tabButtons = document.querySelectorAll('.nav-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

const TAB_TITLES = {
  'tab-overview': { title: 'Marketing Overview', crumb: 'Dashboard / Overview' },
  'tab-create': { title: 'AI Campaign Generator', crumb: 'Dashboard / AI Creator' },
  'tab-campaigns': { title: 'Campaigns & Drafts', crumb: 'Dashboard / Campaigns' },
  'tab-editor': { title: 'Campaign Editor & Approval', crumb: 'Dashboard / Editor & Social Mockups' },
  'tab-social-accounts': { title: 'Social Accounts & Meta API', crumb: 'Dashboard / Meta Publishing' }
};

function switchTab(tabId) {
  tabButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });

  tabPanes.forEach(pane => {
    pane.classList.toggle('active', pane.id === tabId);
  });

  if (TAB_TITLES[tabId]) {
    pageTitle.textContent = TAB_TITLES[tabId].title;
    pageBreadcrumb.textContent = TAB_TITLES[tabId].crumb;
  }

  if (tabId === 'tab-editor') {
    renderCanvas();
  }
}

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    switchTab(btn.dataset.tab);
  });
});

document.getElementById('btn-quick-create').addEventListener('click', () => {
  switchTab('tab-create');
});

// ----------------- GLOBAL ALERTS -----------------
function showAlert(message, type = 'info', timeoutMs = 6000) {
  const alertEl = document.createElement('div');
  alertEl.className = `alert alert-${type}`;
  alertEl.innerHTML = `<strong>${type.toUpperCase()}:</strong> ${message}`;
  globalAlertContainer.appendChild(alertEl);

  setTimeout(() => {
    alertEl.style.transition = 'opacity 0.4s';
    alertEl.style.opacity = '0';
    setTimeout(() => alertEl.remove(), 400);
  }, timeoutMs);
}

// ----------------- INITIAL DATA LOAD -----------------
async function loadInitialData() {
  await Promise.all([
    fetchCampaigns(),
    fetchMetaSettings()
  ]);
}

// ----------------- CAMPAIGNS API -----------------
async function fetchCampaigns() {
  try {
    const res = await authFetch('/api/campaigns');
    const data = await res.json();
    if (data.success && data.campaigns) {
      allCampaigns = data.campaigns;
      updateStats();
      renderOverviewTable();
      renderCampaignsTable();
      
      // If no active campaign, default to the first one
      if (!activeCampaign && allCampaigns.length > 0) {
        setActiveCampaign(allCampaigns[0]);
      }
    }
  } catch (err) {
    console.error('Error fetching campaigns:', err);
  }
}

function updateStats() {
  const drafts = allCampaigns.filter(c => c.status === 'draft').length;
  const approved = allCampaigns.filter(c => c.status === 'approved').length;
  const scheduled = allCampaigns.filter(c => c.status === 'scheduled').length;
  const published = allCampaigns.filter(c => c.status === 'published').length;

  document.getElementById('stat-drafts').textContent = drafts;
  document.getElementById('stat-approved').textContent = approved;
  document.getElementById('stat-scheduled').textContent = scheduled;
  document.getElementById('stat-published').textContent = published;
  document.getElementById('badge-total-campaigns').textContent = allCampaigns.length;
}

function renderOverviewTable() {
  const tbody = document.getElementById('overview-campaigns-tbody');
  tbody.innerHTML = '';

  if (allCampaigns.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">No campaigns created yet. Click "+ New AI Campaign" to get started.</td></tr>';
    return;
  }

  const recent = allCampaigns.slice(0, 5);
  recent.forEach(c => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(c.title)}</strong></td>
      <td><span class="badge badge-outline">${escapeHtml(c.serviceCategory)}</span></td>
      <td>${c.platforms.map(p => `<span class="badge">${p}</span>`).join(' ')}</td>
      <td><span class="badge badge-${c.status}">${c.status.toUpperCase()}</span></td>
      <td>
        ${c.approval?.approved 
          ? `<span class="badge badge-approved">✓ Approved</span>` 
          : `<span class="badge badge-draft">Pending Review</span>`}
      </td>
      <td>
        <span class="text-xs text-muted">
          ${c.publishedAt ? 'Published ' + new Date(c.publishedAt).toLocaleDateString() : (c.scheduledFor ? 'Scheduled ' + new Date(c.scheduledFor).toLocaleString() : 'Draft')}
        </span>
      </td>
      <td>
        <button class="btn btn-outline btn-sm btn-edit-campaign" data-id="${c.id}">Edit</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.btn-edit-campaign').forEach(btn => {
    btn.addEventListener('click', () => {
      const camp = allCampaigns.find(c => c.id === btn.dataset.id);
      if (camp) {
        setActiveCampaign(camp);
        switchTab('tab-editor');
      }
    });
  });
}

function renderCampaignsTable() {
  const tbody = document.getElementById('campaigns-list-tbody');
  tbody.innerHTML = '';

  const filterStatus = document.getElementById('campaign-filter-status').value;
  const filtered = filterStatus === 'all' 
    ? allCampaigns 
    : allCampaigns.filter(c => c.status === filterStatus);

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">No matching campaigns found.</td></tr>';
    return;
  }

  filtered.forEach(c => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="table-thumb" style="background:${c.graphicData?.bgColor || '#2C3E50'}; display:flex; align-items:center; justify-content:center; color:#fff; font-size:10px; font-weight:700;">
          LBH
        </div>
      </td>
      <td>
        <strong>${escapeHtml(c.title)}</strong>
        <div class="text-xs text-muted">${escapeHtml(c.serviceCategory)}</div>
      </td>
      <td>${c.platforms.map(p => `<span class="badge">${p}</span>`).join(' ')}</td>
      <td>
        ${c.approval?.approved 
          ? `<span class="badge badge-approved">✓ Approved (${new Date(c.approval.approvedAt).toLocaleDateString()})</span>` 
          : `<span class="badge badge-draft">Draft</span>`}
      </td>
      <td><span class="badge badge-${c.status}">${c.status.toUpperCase()}</span></td>
      <td><span class="text-xs text-muted">${new Date(c.updatedAt).toLocaleString()}</span></td>
      <td>
        <div style="display:flex; gap:6px;">
          <button class="btn btn-outline btn-sm btn-open-editor" data-id="${c.id}">Edit</button>
          <button class="btn btn-ghost-danger btn-sm btn-delete-campaign" data-id="${c.id}">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.btn-open-editor').forEach(btn => {
    btn.addEventListener('click', () => {
      const camp = allCampaigns.find(c => c.id === btn.dataset.id);
      if (camp) {
        setActiveCampaign(camp);
        switchTab('tab-editor');
      }
    });
  });

  tbody.querySelectorAll('.btn-delete-campaign').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to delete this campaign? This cannot be undone.')) {
        await deleteCampaign(btn.dataset.id);
      }
    });
  });
}

document.getElementById('campaign-filter-status').addEventListener('change', renderCampaignsTable);
document.getElementById('btn-refresh-campaigns').addEventListener('click', fetchCampaigns);
document.getElementById('btn-refresh-overview').addEventListener('click', fetchCampaigns);

async function deleteCampaign(id) {
  try {
    const res = await authFetch(`/api/campaigns/${id}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      showAlert('Campaign deleted successfully', 'info');
      await fetchCampaigns();
    } else {
      const d = await res.json();
      showAlert(d.error || 'Failed to delete campaign', 'danger');
    }
  } catch (err) {
    showAlert('Error deleting campaign: ' + err.message, 'danger');
  }
}

// ----------------- AI CAMPAIGN GENERATOR -----------------
const aiForm = document.getElementById('ai-generator-form');
const btnGenerateAi = document.getElementById('btn-generate-ai');
const generateSpinner = document.getElementById('generate-spinner');
const aiResultsPlaceholder = document.getElementById('ai-results-placeholder');
const aiResultsList = document.getElementById('ai-results-list');
const resultsCountText = document.getElementById('results-count-text');

aiForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  btnGenerateAi.disabled = true;
  generateSpinner.classList.remove('hidden');

  const payload = {
    serviceCategory: document.getElementById('ai-service-category').value,
    customTopic: document.getElementById('ai-custom-topic').value,
    targetAudience: document.getElementById('ai-target-audience').value,
    promotionalGoal: document.getElementById('ai-promotional-goal').value,
    tone: document.getElementById('ai-tone').value,
    language: document.getElementById('ai-language').value
  };

  try {
    const res = await authFetch('/api/gemini/generate-campaign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'AI generation failed');
    }

    renderAiVariations(data.data, payload);
    showAlert('Successfully generated 3 marketing campaign variations!', 'success');
  } catch (err) {
    console.error('AI generation error:', err);
    showAlert('AI Generation error: ' + err.message, 'danger');
  } finally {
    btnGenerateAi.disabled = false;
    generateSpinner.classList.add('hidden');
  }
});

function renderAiVariations(data, formInputs) {
  aiResultsPlaceholder.classList.add('hidden');
  aiResultsList.classList.remove('hidden');
  aiResultsList.innerHTML = '';

  const variations = data.variations || [];
  resultsCountText.textContent = `${variations.length} Variations Generated`;

  variations.forEach((v, index) => {
    const card = document.createElement('div');
    card.className = 'variation-card';
    card.innerHTML = `
      <div class="variation-header">
        <span class="variation-name">Variation ${index + 1}: ${escapeHtml(v.variationName || 'Angle')}</span>
        <button class="btn btn-primary btn-sm btn-use-variation" data-index="${index}">
          Load Into Editor →
        </button>
      </div>
      <div class="variation-headline">"${escapeHtml(v.headline)}"</div>
      <div class="variation-hook">${escapeHtml(v.hook)}</div>
      <div class="variation-body">${escapeHtml(v.bodyCopy)}</div>
      <div class="text-xs mt-2"><strong>CTA:</strong> ${escapeHtml(v.callToAction)}</div>
      <div class="variation-tags mt-2">
        ${(v.hashtags || []).map(t => `<span class="tag-chip">${escapeHtml(t)}</span>`).join(' ')}
      </div>
    `;
    aiResultsList.appendChild(card);
  });

  aiResultsList.querySelectorAll('.btn-use-variation').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.index, 10);
      const chosen = variations[idx];

      // Create new draft campaign
      const newCamp = {
        title: `${formInputs.serviceCategory} - ${chosen.variationName || 'Campaign'}`,
        serviceCategory: formInputs.serviceCategory,
        targetAudience: formInputs.targetAudience,
        goal: formInputs.promotionalGoal,
        aspectRatio: '1:1',
        headline: chosen.headline,
        hook: chosen.hook,
        bodyCopy: chosen.bodyCopy,
        callToAction: chosen.callToAction,
        hashtags: chosen.hashtags || ['#Sylhet', '#LittleBigHelp'],
        graphicData: chosen.recommendedGraphic || {
          headline: chosen.headline,
          subhead: 'Little Big Help • Sylhet',
          accentColor: '#F26A5A',
          bgColor: '#2C3E50',
          textColor: '#FFFFFF',
          badgeText: 'Verified Local Service'
        },
        platforms: ['facebook', 'instagram']
      };

      try {
        const res = await authFetch('/api/campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newCamp)
        });
        const d = await res.json();
        if (d.success) {
          allCampaigns.unshift(d.campaign);
          updateStats();
          renderCampaignsTable();
          renderOverviewTable();
          setActiveCampaign(d.campaign);
          switchTab('tab-editor');
          showAlert('Loaded into Editor. Please review, edit, and approve when ready.', 'success');
        }
      } catch (err) {
        showAlert('Error creating campaign: ' + err.message, 'danger');
      }
    });
  });
}

// ----------------- CAMPAIGN EDITOR & APPROVAL GATE -----------------
function setActiveCampaign(c) {
  activeCampaign = { ...c };
  customImageObj = null;

  document.getElementById('editor-campaign-title').value = activeCampaign.title || '';
  document.getElementById('editor-status-badge').className = `badge badge-${activeCampaign.status}`;
  document.getElementById('editor-status-badge').textContent = `Status: ${activeCampaign.status.toUpperCase()}`;
  
  const approvalBadge = document.getElementById('editor-approval-badge');
  const btnApproval = document.getElementById('btn-toggle-approval');
  const btnPublish = document.getElementById('btn-open-publish-modal');
  const btnSchedule = document.getElementById('btn-open-schedule-modal');
  const callout = document.getElementById('preview-approval-callout');

  if (activeCampaign.approval?.approved) {
    approvalBadge.className = 'badge badge-approved';
    approvalBadge.textContent = '✓ Approved';
    btnApproval.className = 'btn btn-outline';
    btnApproval.textContent = 'Revoke Approval';
    btnPublish.disabled = false;
    btnSchedule.disabled = false;
    callout.className = 'approval-callout approved';
    callout.innerHTML = `
      <div class="callout-icon">✅</div>
      <div class="callout-body">
        <strong>Campaign Approved</strong>
        <p>Approved by ${escapeHtml(activeCampaign.approval.approvedBy || 'Admin')} on ${new Date(activeCampaign.approval.approvedAt).toLocaleDateString()}. Publishing and scheduling controls are unlocked.</p>
      </div>
    `;
  } else {
    approvalBadge.className = 'badge badge-draft';
    approvalBadge.textContent = 'Unapproved';
    btnApproval.className = 'btn btn-warning';
    btnApproval.textContent = '🛡️ Approve Campaign';
    btnPublish.disabled = true;
    btnSchedule.disabled = true;
    callout.className = 'approval-callout pending';
    callout.innerHTML = `
      <div class="callout-icon">⚠️</div>
      <div class="callout-body">
        <strong>Approval Required</strong>
        <p>This campaign is in <em>${activeCampaign.status.toUpperCase()}</em> mode. Publishing and scheduling are locked until explicit approval is granted.</p>
      </div>
    `;
  }

  document.getElementById('editor-id-badge').textContent = `ID: ${activeCampaign.id}`;

  // Form Fields
  document.getElementById('editor-headline').value = activeCampaign.headline || '';
  document.getElementById('editor-hook').value = activeCampaign.hook || '';
  document.getElementById('editor-body').value = activeCampaign.bodyCopy || '';
  document.getElementById('editor-cta').value = activeCampaign.callToAction || '';
  document.getElementById('editor-hashtags').value = (activeCampaign.hashtags || []).join(' ');
  document.getElementById('editor-service-category').value = activeCampaign.serviceCategory || 'Everyday Help';

  // Platforms
  document.getElementById('plat-facebook').checked = activeCampaign.platforms.includes('facebook');
  document.getElementById('plat-instagram').checked = activeCampaign.platforms.includes('instagram');

  // Graphic Controls
  const g = activeCampaign.graphicData || {};
  document.getElementById('editor-aspect-ratio').value = activeCampaign.aspectRatio || '1:1';
  document.getElementById('editor-graphic-badge').value = g.badgeText || 'Verified Local Service';
  document.getElementById('editor-graphic-headline').value = g.headline || activeCampaign.headline || 'Little Big Help';
  document.getElementById('editor-graphic-subhead').value = g.subhead || 'Small Tasks, Big Relief';
  document.getElementById('editor-graphic-accent').value = g.accentColor || '#F26A5A';
  document.getElementById('editor-graphic-bg').value = g.bgColor || '#2C3E50';

  updateLivePreviewText();
  renderCanvas();
}

function updateLivePreviewText() {
  if (!activeCampaign) return;

  const headline = document.getElementById('editor-headline').value;
  const hook = document.getElementById('editor-hook').value;
  const body = document.getElementById('editor-body').value;
  const cta = document.getElementById('editor-cta').value;
  const tags = document.getElementById('editor-hashtags').value;

  const fullText = `${headline ? headline + '\n\n' : ''}${hook ? hook + '\n\n' : ''}${body ? body + '\n\n' : ''}${cta ? '👉 ' + cta + '\n\n' : ''}${tags}`;

  document.getElementById('fb-preview-text').textContent = fullText;
  document.getElementById('ig-preview-text').textContent = fullText;
}

// Live inputs update previews
['editor-headline', 'editor-hook', 'editor-body', 'editor-cta', 'editor-hashtags'].forEach(id => {
  document.getElementById(id).addEventListener('input', updateLivePreviewText);
});

['editor-graphic-badge', 'editor-graphic-headline', 'editor-graphic-subhead', 'editor-graphic-accent', 'editor-graphic-bg', 'editor-aspect-ratio'].forEach(id => {
  document.getElementById(id).addEventListener('input', renderCanvas);
});

// Color Preset Themes
document.getElementById('editor-graphic-theme').addEventListener('change', (e) => {
  const theme = e.target.value;
  const accentInput = document.getElementById('editor-graphic-accent');
  const bgInput = document.getElementById('editor-graphic-bg');

  if (theme === 'coral_slate') {
    accentInput.value = '#F26A5A';
    bgInput.value = '#2C3E50';
  } else if (theme === 'sage_forest') {
    accentInput.value = '#6A8E7F';
    bgInput.value = '#1C2E24';
  } else if (theme === 'cream_coral') {
    accentInput.value = '#F26A5A';
    bgInput.value = '#FBF8F3';
  } else if (theme === 'modern_dark') {
    accentInput.value = '#00D2B4';
    bgInput.value = '#0F172A';
  }
  renderCanvas();
});

// Custom Uploaded Image
document.getElementById('editor-image-upload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      customImageObj = img;
      document.getElementById('btn-clear-custom-image').classList.remove('hidden');
      renderCanvas();
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

document.getElementById('btn-clear-custom-image').addEventListener('click', () => {
  customImageObj = null;
  document.getElementById('editor-image-upload').value = '';
  document.getElementById('btn-clear-custom-image').classList.add('hidden');
  renderCanvas();
});

// ----------------- GRAPHIC BANNER CANVAS ENGINE -----------------
function renderCanvas() {
  const aspectRatio = document.getElementById('editor-aspect-ratio').value;
  let width = 1080;
  let height = 1080;

  if (aspectRatio === '4:5') {
    height = 1350;
  } else if (aspectRatio === '9:16') {
    height = 1920;
  }

  [canvasFb, canvasIg].forEach(canvas => {
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    drawBannerOnContext(ctx, width, height);
  });
}

function drawBannerOnContext(ctx, width, height) {
  const badgeText = document.getElementById('editor-graphic-badge').value;
  const headline = document.getElementById('editor-graphic-headline').value;
  const subhead = document.getElementById('editor-graphic-subhead').value;
  const accentColor = document.getElementById('editor-graphic-accent').value;
  const bgColor = document.getElementById('editor-graphic-bg').value;

  // Background Fill
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  // If Custom Image is loaded
  if (customImageObj) {
    // Draw image centered and contained/covered
    const hRatio = width / customImageObj.width;
    const vRatio = height / customImageObj.height;
    const ratio = Math.max(hRatio, vRatio);
    const centerShift_x = (width - customImageObj.width * ratio) / 2;
    const centerShift_y = (height - customImageObj.height * ratio) / 2;
    ctx.drawImage(customImageObj, 0, 0, customImageObj.width, customImageObj.height,
      centerShift_x, centerShift_y, customImageObj.width * ratio, customImageObj.height * ratio);

    // Dark gradient overlay for text readability
    const overlay = ctx.createLinearGradient(0, height * 0.4, 0, height);
    overlay.addColorStop(0, 'rgba(0,0,0,0.1)');
    overlay.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, width, height);
  } else {
    // Modern geometric backdrop shapes
    ctx.save();
    // Ambient glowing circles
    const grad1 = ctx.createRadialGradient(width * 0.85, height * 0.15, 50, width * 0.85, height * 0.15, 450);
    grad1.addColorStop(0, hexToRgba(accentColor, 0.45));
    grad1.addColorStop(1, hexToRgba(accentColor, 0));
    ctx.fillStyle = grad1;
    ctx.beginPath();
    ctx.arc(width * 0.85, height * 0.15, 450, 0, Math.PI * 2);
    ctx.fill();

    const grad2 = ctx.createRadialGradient(width * 0.15, height * 0.85, 50, width * 0.15, height * 0.85, 450);
    grad2.addColorStop(0, hexToRgba('#6A8E7F', 0.35));
    grad2.addColorStop(1, hexToRgba('#6A8E7F', 0));
    ctx.fillStyle = grad2;
    ctx.beginPath();
    ctx.arc(width * 0.15, height * 0.85, 450, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Subtle decorative grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let x = 60; x < width; x += 120) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  }

  // Draw Header Logo & Brand Name
  const topMargin = 70;
  const leftMargin = 70;

  if (brandLogoImg.complete && brandLogoImg.naturalWidth !== 0) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(leftMargin + 32, topMargin + 32, 32, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(brandLogoImg, leftMargin, topMargin, 64, 64);
    ctx.restore();
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 32px sans-serif';
  ctx.fillText('Little Big Help', leftMargin + 80, topMargin + 34);

  ctx.fillStyle = accentColor;
  ctx.font = '500 18px sans-serif';
  ctx.fillText('Small Tasks, Big Relief', leftMargin + 80, topMargin + 58);

  // Badge Pill
  if (badgeText) {
    const badgeY = topMargin + 130;
    ctx.font = 'bold 20px sans-serif';
    const textWidth = ctx.measureText(badgeText.toUpperCase()).width;
    const badgeWidth = textWidth + 36;
    const badgeHeight = 40;

    ctx.fillStyle = accentColor;
    roundRect(ctx, leftMargin, badgeY, badgeWidth, badgeHeight, 20);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(badgeText.toUpperCase(), leftMargin + 18, badgeY + 27);
  }

  // Headline (word-wrapped)
  const headlineY = topMargin + 250;
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 64px sans-serif';
  const maxHeadlineWidth = width - (leftMargin * 2);
  const headlineLines = wrapText(ctx, headline, maxHeadlineWidth);

  let currentY = headlineY;
  headlineLines.forEach((line) => {
    ctx.fillText(line, leftMargin, currentY);
    currentY += 76;
  });

  // Subhead
  if (subhead) {
    currentY += 20;
    ctx.fillStyle = '#E2E8F0';
    ctx.font = '400 32px sans-serif';
    const subheadLines = wrapText(ctx, subhead, maxHeadlineWidth);
    subheadLines.forEach((line) => {
      ctx.fillText(line, leftMargin, currentY);
      currentY += 44;
    });
  }

  // Bottom Contact Card
  const cardHeight = 110;
  const cardY = height - cardHeight - 60;
  const cardWidth = width - (leftMargin * 2);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  roundRect(ctx, leftMargin, cardY, cardWidth, cardHeight, 16);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 2;
  roundRect(ctx, leftMargin, cardY, cardWidth, cardHeight, 16);
  ctx.stroke();

  // WhatsApp Icon circle
  ctx.fillStyle = '#25D366';
  ctx.beginPath();
  ctx.arc(leftMargin + 50, cardY + (cardHeight / 2), 28, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText('💬', leftMargin + 37, cardY + (cardHeight / 2) + 9);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText('Chat with Little Big Help on WhatsApp', leftMargin + 100, cardY + 46);

  ctx.fillStyle = '#94A3B8';
  ctx.font = '500 22px sans-serif';
  ctx.fillText('+880 1865-383565 • Sylhet, Bangladesh', leftMargin + 100, cardY + 80);
}

function wrapText(ctx, text, maxWidth) {
  if (!text) return [];
  const words = text.split(' ');
  const lines = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = ctx.measureText(currentLine + ' ' + word).width;
    if (width < maxWidth) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);
  return lines;
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function hexToRgba(hex, alpha) {
  let c;
  if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
    c = hex.substring(1).split('');
    if (c.length === 3) {
      c = [c[0], c[0], c[1], c[1], c[2], c[2]];
    }
    c = '0x' + c.join('');
    return `rgba(${[(c >> 16) & 255, (c >> 8) & 255, c & 255].join(',')},${alpha})`;
  }
  return `rgba(242,106,90,${alpha})`;
}

// Download Graphic Button
document.getElementById('btn-download-graphic').addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = `LittleBigHelp-${(activeCampaign?.title || 'graphic').toLowerCase().replace(/\s+/g, '-')}.png`;
  link.href = canvasFb.toDataURL('image/png');
  link.click();
});

// Preview Tabs Toggle (Facebook vs Instagram)
document.querySelectorAll('.preview-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.preview-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    const target = tab.dataset.preview;
    document.getElementById('preview-facebook').classList.toggle('active', target === 'facebook');
    document.getElementById('preview-instagram').classList.toggle('active', target === 'instagram');
  });
});

// ----------------- SAVE DRAFT -----------------
document.getElementById('btn-save-draft').addEventListener('click', async () => {
  if (!activeCampaign) return;

  const title = document.getElementById('editor-campaign-title').value;
  const headline = document.getElementById('editor-headline').value;
  const hook = document.getElementById('editor-hook').value;
  const bodyCopy = document.getElementById('editor-body').value;
  const callToAction = document.getElementById('editor-cta').value;
  const hashtags = document.getElementById('editor-hashtags').value.split(/[\s,]+/).filter(Boolean);
  const serviceCategory = document.getElementById('editor-service-category').value;
  const aspectRatio = document.getElementById('editor-aspect-ratio').value;

  const platforms = [];
  if (document.getElementById('plat-facebook').checked) platforms.push('facebook');
  if (document.getElementById('plat-instagram').checked) platforms.push('instagram');

  const graphicData = {
    badgeText: document.getElementById('editor-graphic-badge').value,
    headline: document.getElementById('editor-graphic-headline').value,
    subhead: document.getElementById('editor-graphic-subhead').value,
    accentColor: document.getElementById('editor-graphic-accent').value,
    bgColor: document.getElementById('editor-graphic-bg').value,
    textColor: '#FFFFFF'
  };

  const payload = {
    title,
    headline,
    hook,
    bodyCopy,
    callToAction,
    hashtags,
    serviceCategory,
    aspectRatio,
    platforms,
    graphicData
  };

  try {
    const res = await authFetch(`/api/campaigns/${activeCampaign.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const d = await res.json();
    if (d.success) {
      if (d.approvalRevoked) {
        showAlert('⚠️ Content was modified: Previous approval has been automatically invalidated and status reset to Draft. Re-approval is required before publishing.', 'warning', 8000);
      } else {
        showAlert('Draft saved successfully!', 'success');
      }
      setActiveCampaign(d.campaign);
      await fetchCampaigns();
    } else {
      showAlert(d.error || 'Failed to save draft', 'danger');
    }
  } catch (err) {
    showAlert('Error saving draft: ' + err.message, 'danger');
  }
});

// ----------------- APPROVAL WORKFLOW GATE -----------------
const modalApproval = document.getElementById('modal-approval');
const btnToggleApproval = document.getElementById('btn-toggle-approval');
const btnConfirmApproval = document.getElementById('btn-confirm-approval');

btnToggleApproval.addEventListener('click', () => {
  if (!activeCampaign) return;

  if (activeCampaign.approval?.approved) {
    // Revoke
    if (confirm('Are you sure you want to revoke approval? This will lock the Publish and Schedule buttons.')) {
      revokeApproval();
    }
  } else {
    // Open explicit approval modal
    document.getElementById('approval-modal-title').textContent = activeCampaign.title;
    document.getElementById('approval-modal-category').textContent = `Category: ${activeCampaign.serviceCategory}`;
    modalApproval.classList.remove('hidden');
  }
});

btnConfirmApproval.addEventListener('click', async () => {
  modalApproval.classList.add('hidden');
  try {
    const res = await authFetch(`/api/campaigns/${activeCampaign.id}/approve`, {
      method: 'POST'
    });
    const d = await res.json();
    if (d.success) {
      showAlert('🛡️ Campaign explicitly approved! Publish and Schedule controls are now unlocked.', 'success');
      setActiveCampaign(d.campaign);
      await fetchCampaigns();
    } else {
      showAlert(d.error || 'Approval failed', 'danger');
    }
  } catch (err) {
    showAlert('Error approving campaign: ' + err.message, 'danger');
  }
});

async function revokeApproval() {
  try {
    const res = await authFetch(`/api/campaigns/${activeCampaign.id}/revoke-approval`, {
      method: 'POST'
    });
    const d = await res.json();
    if (d.success) {
      showAlert('Approval revoked. Campaign returned to Draft.', 'info');
      setActiveCampaign(d.campaign);
      await fetchCampaigns();
    } else {
      showAlert(d.error || 'Failed to revoke approval', 'danger');
    }
  } catch (err) {
    showAlert('Error: ' + err.message, 'danger');
  }
}

// ----------------- PUBLISH MODAL & EXECUTION -----------------
const modalPublish = document.getElementById('modal-publish');
const btnOpenPublish = document.getElementById('btn-open-publish-modal');
const btnConfirmPublish = document.getElementById('btn-confirm-publish');
const publishSpinner = document.getElementById('publish-spinner');

btnOpenPublish.addEventListener('click', () => {
  if (!activeCampaign || !activeCampaign.approval?.approved) {
    showAlert('Approval required before publishing.', 'warning');
    return;
  }
  modalPublish.classList.remove('hidden');
});

btnConfirmPublish.addEventListener('click', async () => {
  btnConfirmPublish.disabled = true;
  publishSpinner.classList.remove('hidden');

  try {
    const res = await authFetch(`/api/campaigns/${activeCampaign.id}/publish`, {
      method: 'POST'
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Publishing failed');
    }

    modalPublish.classList.add('hidden');
    showAlert('🚀 Post published successfully to Meta social channels!', 'success');
    await fetchCampaigns();
  } catch (err) {
    showAlert('Publication Error: ' + err.message, 'danger');
  } finally {
    btnConfirmPublish.disabled = false;
    publishSpinner.classList.add('hidden');
  }
});

// ----------------- SCHEDULE MODAL & EXECUTION -----------------
const modalSchedule = document.getElementById('modal-schedule');
const btnOpenSchedule = document.getElementById('btn-open-schedule-modal');
const btnConfirmSchedule = document.getElementById('btn-confirm-schedule');

btnOpenSchedule.addEventListener('click', () => {
  if (!activeCampaign || !activeCampaign.approval?.approved) {
    showAlert('Approval required before scheduling.', 'warning');
    return;
  }
  modalSchedule.classList.remove('hidden');
});

btnConfirmSchedule.addEventListener('click', async () => {
  const time = document.getElementById('schedule-datetime').value;
  if (!time) {
    showAlert('Please pick a publication date and time', 'warning');
    return;
  }

  try {
    const res = await authFetch(`/api/campaigns/${activeCampaign.id}/schedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ scheduledTime: time })
    });
    const data = await res.json();
    if (data.success) {
      modalSchedule.classList.add('hidden');
      showAlert(`Campaign scheduled for ${new Date(time).toLocaleString()} (Asia/Dhaka)`, 'success');
      await fetchCampaigns();
    } else {
      showAlert(data.error || 'Scheduling failed', 'danger');
    }
  } catch (err) {
    showAlert('Error: ' + err.message, 'danger');
  }
});

// Modal Close Handlers
document.querySelectorAll('[data-close-modal]').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.closeModal;
    document.getElementById(target).classList.add('hidden');
  });
});

// ----------------- SOCIAL ACCOUNTS / META CONFIG (Priority 3) -----------------
async function fetchMetaSettings() {
  try {
    const res = await authFetch('/api/meta/settings');
    const data = await res.json();
    if (data.success && data.settings) {
      metaSettings = data.settings;
      renderMetaSettingsUI();
    }
  } catch (err) {
    console.error('Meta settings fetch error:', err);
  }
}

function renderMetaSettingsUI() {
  if (!metaSettings) return;

  document.getElementById('setting-fb-page-id').value = metaSettings.facebookPageId || '';
  document.getElementById('setting-ig-account-id').value = metaSettings.instagramAccountId || '';
  document.getElementById('setting-meta-app-id').value = metaSettings.metaAppId || '';

  const hint = document.getElementById('token-status-hint');
  const badge = document.getElementById('meta-connection-badge');
  const badgeText = document.getElementById('meta-connection-text');

  if (metaSettings.hasToken) {
    hint.textContent = `Stored Token: ${metaSettings.maskedToken} (Graph API ${metaSettings.graphApiVersion || 'v26.0'})`;
  } else {
    hint.textContent = 'No token stored. Please paste your Meta Page Access Token.';
  }

  if (metaSettings.metaConnected) {
    badge.className = 'connection-pill online';
    badgeText.textContent = `Connected: ${metaSettings.pageName || 'Facebook Page'}`;
    topbarMetaStatus.innerHTML = '<span class="status-indicator success"></span><span>Meta: Connected</span>';
    navMetaDot.className = 'connection-status-dot online';
  } else {
    badge.className = 'connection-pill offline';
    badgeText.textContent = 'Disconnected';
    topbarMetaStatus.innerHTML = '<span class="status-indicator danger"></span><span>Meta: Disconnected</span>';
    navMetaDot.className = 'connection-status-dot offline';
  }
}

// Toggle token visibility
let tokenMasked = true;
document.getElementById('btn-toggle-token-mask').addEventListener('click', () => {
  const tokenInput = document.getElementById('setting-page-access-token');
  tokenMasked = !tokenMasked;
  tokenInput.type = tokenMasked ? 'password' : 'text';
  document.getElementById('btn-toggle-token-mask').textContent = tokenMasked ? '👁️ Show' : '🔒 Hide';
});

// Save Meta Settings
document.getElementById('meta-settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    facebookPageId: document.getElementById('setting-fb-page-id').value,
    instagramAccountId: document.getElementById('setting-ig-account-id').value,
    metaAppId: document.getElementById('setting-meta-app-id').value,
    metaPageAccessToken: document.getElementById('setting-page-access-token').value
  };

  try {
    const res = await authFetch('/api/meta/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const d = await res.json();
    if (d.success) {
      showAlert('Meta configuration saved successfully!', 'success');
      document.getElementById('setting-page-access-token').value = '';
      await fetchMetaSettings();
    }
  } catch (err) {
    showAlert('Error saving settings: ' + err.message, 'danger');
  }
});

// Test Connection (Real Meta Graph API v26.0)
document.getElementById('btn-test-meta-connection').addEventListener('click', async () => {
  const btn = document.getElementById('btn-test-meta-connection');
  const spinner = document.getElementById('test-conn-spinner');
  const resultBox = document.getElementById('meta-test-result');

  btn.disabled = true;
  spinner.classList.remove('hidden');
  resultBox.classList.add('hidden');

  try {
    const res = await authFetch('/api/meta/test-connection', {
      method: 'POST'
    });
    const d = await res.json();

    resultBox.classList.remove('hidden');
    if (d.connected) {
      resultBox.className = 'test-result-box success';
      resultBox.innerHTML = `
        <strong>✓ Meta Connection Verified!</strong><br />
        Connected Page: <strong>${escapeHtml(d.pageInfo.name)}</strong> (ID: ${d.pageInfo.id})<br />
        Category: ${escapeHtml(d.pageInfo.category)}<br />
        Graph API: ${d.graphApiVersion || 'v26.0'}<br />
        Status: Token verified and ready for live publishing.
      `;
      showAlert(`Verified Meta Page "${d.pageInfo.name}"!`, 'success');
    } else {
      resultBox.className = 'test-result-box error';
      resultBox.innerHTML = `
        <strong>Connection Failed:</strong> ${escapeHtml(d.error)}<br />
        <small class="text-muted">Ensure your token is valid and includes the required pages_manage_posts and instagram_content_publish permissions.</small>
      `;
    }
    await fetchMetaSettings();
  } catch (err) {
    resultBox.className = 'test-result-box error';
    resultBox.classList.remove('hidden');
    resultBox.innerHTML = `<strong>Network Error:</strong> ${escapeHtml(err.message)}`;
  } finally {
    btn.disabled = false;
    spinner.classList.add('hidden');
  }
});

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
// ----------------- DATA PERSISTENCE & BACKUP (Priority 2) -----------------
const btnExportBackup = document.getElementById('btn-export-backup');
const btnRestoreBackup = document.getElementById('btn-restore-backup');
const fileRestoreBackup = document.getElementById('file-restore-backup');

if (btnExportBackup) {
  btnExportBackup.addEventListener('click', async () => {
    try {
      const res = await authFetch('/api/backup/export');
      if (!res.ok) throw new Error('Backup export request failed');
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `lbh-marketing-backup-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
      showAlert('✓ Full JSON backup downloaded successfully!', 'success');
    } catch (err) {
      showAlert('Backup error: ' + err.message, 'danger');
    }
  });
}

if (btnRestoreBackup && fileRestoreBackup) {
  btnRestoreBackup.addEventListener('click', () => {
    fileRestoreBackup.click();
  });

  fileRestoreBackup.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed.campaigns || !Array.isArray(parsed.campaigns)) {
        throw new Error('Invalid backup file: Missing "campaigns" array.');
      }
      const res = await authFetch('/api/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaigns: parsed.campaigns })
      });
      const data = await res.json();
      if (data.success) {
        showAlert(`✓ ${data.message}`, 'success');
        await fetchCampaigns();
      } else {
        showAlert(data.error || 'Restore failed', 'danger');
      }
    } catch (err) {
      showAlert('Restore error: ' + err.message, 'danger');
    } finally {
      e.target.value = '';
    }
  });
}

// Admin Passcode Management
const passcodeChangeForm = document.getElementById('passcode-change-form');
const passcodeChangeAlert = document.getElementById('passcode-change-alert');
const currentPasscodeInput = document.getElementById('current-passcode-input');
const newPasscodeInput = document.getElementById('new-passcode-input');
const passcodeSpinner = document.getElementById('passcode-spinner');

if (passcodeChangeForm) {
  passcodeChangeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (passcodeSpinner) passcodeSpinner.classList.remove('hidden');
    if (passcodeChangeAlert) passcodeChangeAlert.className = 'alert hidden';

    const currentPasscode = currentPasscodeInput.value.trim();
    const newPasscode = newPasscodeInput.value.trim();

    try {
      const res = await authFetch('/api/auth/change-passcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPasscode, newPasscode })
      });
      const data = await res.json();

      if (data.success) {
        if (passcodeChangeAlert) {
          passcodeChangeAlert.className = 'alert alert-success';
          passcodeChangeAlert.textContent = '✓ ' + data.message;
        }
        currentPasscodeInput.value = '';
        newPasscodeInput.value = '';
        showAlert('✓ Administrator passcode updated successfully.', 'success');
      } else {
        if (passcodeChangeAlert) {
          passcodeChangeAlert.className = 'alert alert-danger';
          passcodeChangeAlert.textContent = data.error || 'Failed to update passcode.';
        }
      }
    } catch (err) {
      if (passcodeChangeAlert) {
        passcodeChangeAlert.className = 'alert alert-danger';
        passcodeChangeAlert.textContent = 'Error: ' + err.message;
      }
    } finally {
      if (passcodeSpinner) passcodeSpinner.classList.add('hidden');
    }
  });
}

// Start Application
checkAuth();
