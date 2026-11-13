// ALLORA - Concierge Operations & AI Marketing Dashboard
// Client controller for private administrator workspace

import alloraEmblemUrl from './assets/images/allora-emblem.svg';

// Clean up any legacy token in localStorage; session is handled via httpOnly cookie / sessionStorage
try {
  localStorage.removeItem('lbh_admin_token');
} catch (_) {}

let currentAdminUser = null;
let allCampaigns = [];
let allInquiries = [];
let activeCampaign = null;
let activeInquiry = null;
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
const navMetaDot = document.getElementById('nav-meta-dot');
const globalAlertContainer = document.getElementById('global-alert-container');

// Canvas
const canvasFb = document.getElementById('banner-canvas');
const canvasIg = document.getElementById('banner-canvas-ig');

// Initialize Brand Emblem for Canvas
const brandLogoImg = new Image();
brandLogoImg.src = alloraEmblemUrl;
brandLogoImg.onload = () => {
  renderCanvas();
};

// ----------------- AUTHENTICATION -----------------
async function authFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  const storedToken = sessionStorage.getItem('lbh_admin_token');
  if (storedToken && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${storedToken}`;
  }
  const opts = {
    ...options,
    headers,
    credentials: 'include'
  };

  try {
    const res = await fetch(url, opts);
    if (res.status === 401 && !url.includes('/api/auth/login')) {
      showAlert('Session expired or unauthorized. Please sign in again.', 'warning');
      logout();
    }
    return res;
  } catch (err) {
    console.error('Network request failed:', err);
    showAlert('Network error communicating with server: ' + err.message, 'danger');
    throw err;
  }
}

let authRetryCount = 0;
async function checkAuth() {
  try {
    const headers = {};
    const storedToken = sessionStorage.getItem('lbh_admin_token');
    if (storedToken) {
      headers['Authorization'] = `Bearer ${storedToken}`;
    }
    const res = await fetch('/api/auth/me', {
      headers,
      credentials: 'include'
    });

    if (res.status === 401) {
      window.location.href = '/admin';
      return;
    }

    const data = await res.json();

    if (data.authenticated && data.user) {
      authRetryCount = 0;
      currentAdminUser = data.user;
      showAdminApp();
      loadInitialData();
    } else {
      window.location.href = '/admin';
    }
  } catch (err) {
    console.warn('Network issue verifying session, retrying:', err);
    authRetryCount++;
    if (authRetryCount < 4) {
      setTimeout(checkAuth, 2500);
    } else {
      showAlert('Unable to reach server. Please check your internet connection.', 'warning');
    }
  }
}

function showAdminApp() {
  if (authScreen) authScreen.classList.add('hidden');
  adminApp.classList.remove('hidden');
  if (currentAdminUser) {
    document.getElementById('sidebar-user-email').textContent = currentAdminUser.email;
  }
}

function logout() {
  const headers = {};
  const storedToken = sessionStorage.getItem('lbh_admin_token');
  if (storedToken) {
    headers['Authorization'] = `Bearer ${storedToken}`;
  }
  fetch('/api/auth/logout', {
    method: 'POST',
    headers,
    credentials: 'include'
  }).finally(() => {
    currentAdminUser = null;
    try {
      sessionStorage.removeItem('lbh_admin_token');
      localStorage.removeItem('lbh_admin_token');
    } catch (_) {}
    window.location.href = '/admin';
  });
}

if (loginForm) {
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

      if (data.token) {
        sessionStorage.setItem('lbh_admin_token', data.token);
      }
      currentAdminUser = data.user;
      showAdminApp();
      loadInitialData();
      showAlert('Welcome back. You are securely signed in to the ALLORA workspace.', 'success');
    } catch (err) {
      loginError.textContent = err.message;
      loginError.classList.remove('hidden');
    } finally {
      loginSpinner.classList.add('hidden');
      btnLogin.disabled = false;
    }
  });
}

document.getElementById('btn-logout').addEventListener('click', logout);

// ----------------- NAVIGATION & TABS -----------------
const tabButtons = document.querySelectorAll('.nav-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

const TAB_TITLES = {
  'tab-overview': { title: 'Workspace Overview', crumb: 'ALLORA / Overview' },
  'tab-inquiries': { title: 'Customer Inquiries', crumb: 'ALLORA / Customer Inquiries' },
  'tab-create': { title: 'AI Campaign Generator', crumb: 'ALLORA / AI Creator' },
  'tab-campaigns': { title: 'Campaigns & Drafts', crumb: 'ALLORA / Campaigns' },
  'tab-editor': { title: 'Campaign Editor & Approval', crumb: 'ALLORA / Editor & Social Mockups' },
  'tab-social-accounts': { title: 'Social & Settings', crumb: 'ALLORA / Meta & Configuration' }
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

const btnViewAllInquiries = document.getElementById('btn-view-all-inquiries');
if (btnViewAllInquiries) {
  btnViewAllInquiries.addEventListener('click', () => switchTab('tab-inquiries'));
}

// ----------------- GLOBAL ALERTS -----------------
function showAlert(message, type = 'info', timeoutMs = 6000) {
  const alertEl = document.createElement('div');
  alertEl.className = `alert alert-${type}`;
  alertEl.innerHTML = `<strong>${escapeHtml(type.toUpperCase())}:</strong> ${escapeHtml(message)}`;
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
    fetchInquiries(),
    fetchMetaSettings()
  ]);
}

// ----------------- CUSTOMER INQUIRIES API -----------------
const INQUIRY_STATUS_LABELS = {
  new: 'New',
  in_review: 'In Review',
  confirmed: 'Confirmed',
  completed: 'Completed',
  archived: 'Archived'
};

async function fetchInquiries() {
  try {
    const res = await authFetch('/api/inquiries');
    const data = await res.json();
    if (data.success && Array.isArray(data.inquiries)) {
      allInquiries = data.inquiries;
      updateInquiryStats();
      renderOverviewInquiries();
      renderInquiriesTable();
    }
  } catch (err) {
    console.error('Error fetching inquiries:', err);
  }
}

function updateInquiryStats() {
  const newCount = allInquiries.filter(i => i.status === 'new').length;
  const statEl = document.getElementById('stat-inquiries');
  const badgeEl = document.getElementById('badge-total-inquiries');
  if (statEl) statEl.textContent = newCount;
  if (badgeEl) badgeEl.textContent = allInquiries.length;
}

function renderOverviewInquiries() {
  const tbody = document.getElementById('overview-inquiries-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (allInquiries.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">No customer inquiries submitted yet. Requests submitted on the ALLORA website appear here automatically.</td></tr>';
    return;
  }

  allInquiries.slice(0, 5).forEach(inq => {
    const tr = document.createElement('tr');
    const statusLabel = INQUIRY_STATUS_LABELS[inq.status] || inq.status;
    tr.innerHTML = `
      <td>
        <strong>${escapeHtml(inq.customerName)}</strong>
        <div class="text-xs text-muted">${escapeHtml(inq.whatsappNumber)}</div>
      </td>
      <td>
        <span class="badge badge-outline">${escapeHtml(inq.serviceCategory)}</span>
        <div class="text-xs text-muted mt-1">${escapeHtml(inq.location || 'Sylhet')}</div>
      </td>
      <td><span class="text-xs text-muted">${escapeHtml(inq.preferredDate || 'Flexible')}</span></td>
      <td><span class="badge badge-inq-${escapeHtml(inq.status)}">${escapeHtml(statusLabel)}</span></td>
      <td><span class="text-xs text-muted">${new Date(inq.createdAt).toLocaleDateString()}</span></td>
      <td>
        <button class="btn btn-outline btn-sm btn-view-inquiry" data-id="${escapeHtml(inq.id)}">Review</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.btn-view-inquiry').forEach(btn => {
    btn.addEventListener('click', () => openInquiryModal(btn.dataset.id));
  });
}

function renderInquiriesTable() {
  const tbody = document.getElementById('inquiries-list-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const statusFilter = document.getElementById('inquiry-filter-status')?.value || 'all';
  const searchQuery = (document.getElementById('inquiry-search-input')?.value || '').trim().toLowerCase();

  const filtered = allInquiries.filter(inq => {
    const matchesStatus = statusFilter === 'all' || inq.status === statusFilter;
    const haystack = [
      inq.customerName,
      inq.whatsappNumber,
      inq.email,
      inq.serviceCategory,
      inq.location,
      inq.taskDescription
    ].join(' ').toLowerCase();
    const matchesSearch = !searchQuery || haystack.includes(searchQuery);
    return matchesStatus && matchesSearch;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">No matching inquiries found.</td></tr>';
    return;
  }

  filtered.forEach(inq => {
    const tr = document.createElement('tr');
    const statusLabel = INQUIRY_STATUS_LABELS[inq.status] || inq.status;
    const truncatedDesc = inq.taskDescription.length > 90
      ? inq.taskDescription.slice(0, 90) + '...'
      : inq.taskDescription;

    tr.innerHTML = `
      <td>
        <strong>${escapeHtml(inq.customerName)}</strong>
        <div class="text-xs text-muted">${escapeHtml(inq.whatsappNumber)}</div>
        ${inq.email ? `<div class="text-xs text-muted">${escapeHtml(inq.email)}</div>` : ''}
      </td>
      <td>
        <span class="badge badge-outline">${escapeHtml(inq.serviceCategory)}</span>
        <div class="text-xs text-muted mt-1">${escapeHtml(inq.location || 'Sylhet / Unspecified')}</div>
      </td>
      <td><span class="text-xs">${escapeHtml(truncatedDesc)}</span></td>
      <td><span class="text-xs text-muted">${escapeHtml(inq.preferredDate || 'Flexible')}</span></td>
      <td><span class="badge badge-inq-${escapeHtml(inq.status)}">${escapeHtml(statusLabel)}</span></td>
      <td><span class="text-xs text-muted">${new Date(inq.createdAt).toLocaleString()}</span></td>
      <td>
        <button class="btn btn-outline btn-sm btn-open-inquiry" data-id="${escapeHtml(inq.id)}">Manage</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.btn-open-inquiry').forEach(btn => {
    btn.addEventListener('click', () => openInquiryModal(btn.dataset.id));
  });
}

function openInquiryModal(id) {
  const inquiry = allInquiries.find(i => i.id === id);
  if (!inquiry) return;
  activeInquiry = inquiry;

  const modal = document.getElementById('modal-inquiry');
  const metaGrid = document.getElementById('inquiry-modal-meta');
  const descBox = document.getElementById('inquiry-modal-description');
  const addWrap = document.getElementById('inquiry-modal-additional-wrap');
  const addBox = document.getElementById('inquiry-modal-additional');
  const digWrap = document.getElementById('inquiry-modal-digital-wrap');
  const digBox = document.getElementById('inquiry-modal-digital');
  const statusSelect = document.getElementById('inquiry-modal-status');
  const notesInput = document.getElementById('inquiry-admin-notes');
  const waBtn = document.getElementById('btn-inquiry-whatsapp');

  document.getElementById('inquiry-modal-heading').textContent = `Inquiry: ${inquiry.customerName}`;
  metaGrid.innerHTML = `
    <div class="inquiry-detail-item"><strong>Customer</strong><span>${escapeHtml(inquiry.customerName)}</span></div>
    <div class="inquiry-detail-item"><strong>WhatsApp</strong><span>${escapeHtml(inquiry.whatsappNumber)}</span></div>
    <div class="inquiry-detail-item"><strong>Email</strong><span>${escapeHtml(inquiry.email || 'Not provided')}</span></div>
    <div class="inquiry-detail-item"><strong>Service Category</strong><span>${escapeHtml(inquiry.serviceCategory)}</span></div>
    <div class="inquiry-detail-item"><strong>Location</strong><span>${escapeHtml(inquiry.location || 'Not specified')}</span></div>
    <div class="inquiry-detail-item"><strong>Date &amp; Priority</strong><span>${escapeHtml(inquiry.preferredDate || 'Flexible')}${inquiry.urgency && inquiry.urgency !== 'Standard' ? ' · ' + escapeHtml(inquiry.urgency) : ''}</span></div>
  `;

  descBox.textContent = inquiry.taskDescription || '';

  if (inquiry.additionalDetails) {
    addWrap.classList.remove('hidden');
    addBox.textContent = inquiry.additionalDetails;
  } else {
    addWrap.classList.add('hidden');
  }

  const hasDigitalDetails = inquiry.businessName || inquiry.existingWebsite || inquiry.websiteType || inquiry.includeMaintenance;
  if (hasDigitalDetails) {
    digWrap.classList.remove('hidden');
    const parts = [];
    if (inquiry.businessName) parts.push(`Business: ${inquiry.businessName}`);
    if (inquiry.existingWebsite) parts.push(`Existing URL: ${inquiry.existingWebsite}`);
    if (inquiry.websiteType) parts.push(`Scope: ${inquiry.websiteType}`);
    parts.push(`Ongoing Maintenance: ${inquiry.includeMaintenance ? 'Requested' : 'No'}`);
    digBox.textContent = parts.join('\n');
  } else {
    digWrap.classList.add('hidden');
  }

  statusSelect.value = inquiry.status || 'new';
  notesInput.value = inquiry.adminNotes || '';

  const digits = (inquiry.whatsappNumber || '').replace(/[^\d]/g, '');
  const waTarget = digits.length >= 7 ? digits : '8801865383565';
  const replyGreeting = `Hello ${inquiry.customerName}, thank you for reaching out to ALLORA regarding ${inquiry.serviceCategory}. We have reviewed your request and would love to confirm details and pricing with you.`;
  waBtn.href = `https://wa.me/${waTarget}?text=${encodeURIComponent(replyGreeting)}`;

  modal.classList.remove('hidden');
}

document.getElementById('inquiry-filter-status')?.addEventListener('change', renderInquiriesTable);
document.getElementById('inquiry-search-input')?.addEventListener('input', renderInquiriesTable);
document.getElementById('btn-refresh-inquiries')?.addEventListener('click', fetchInquiries);

document.getElementById('btn-save-inquiry')?.addEventListener('click', async () => {
  if (!activeInquiry) return;
  const status = document.getElementById('inquiry-modal-status').value;
  const adminNotes = document.getElementById('inquiry-admin-notes').value.trim();

  try {
    const res = await authFetch(`/api/inquiries/${encodeURIComponent(activeInquiry.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, adminNotes })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to update inquiry');
    }

    document.getElementById('modal-inquiry').classList.add('hidden');
    showAlert(`Inquiry updated (${INQUIRY_STATUS_LABELS[status] || status}).`, 'success');
    await fetchInquiries();
  } catch (err) {
    showAlert('Error updating inquiry: ' + err.message, 'danger');
  }
});

document.getElementById('btn-delete-inquiry')?.addEventListener('click', async () => {
  if (!activeInquiry) return;
  if (!confirm(`Delete inquiry from ${activeInquiry.customerName}? This cannot be undone.`)) {
    return;
  }

  try {
    const res = await authFetch(`/api/inquiries/${encodeURIComponent(activeInquiry.id)}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to delete inquiry');
    }

    document.getElementById('modal-inquiry').classList.add('hidden');
    activeInquiry = null;
    showAlert('Inquiry deleted.', 'info');
    await fetchInquiries();
  } catch (err) {
    showAlert('Error deleting inquiry: ' + err.message, 'danger');
  }
});

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
      <td>${(c.platforms || []).map(p => `<span class="badge">${escapeHtml(p)}</span>`).join(' ')}</td>
      <td><span class="badge badge-${escapeHtml(c.status)}">${escapeHtml(c.status.toUpperCase())}</span></td>
      <td>
        ${c.approval?.approved
          ? `<span class="badge badge-approved">&check; Approved</span>`
          : `<span class="badge badge-draft">Pending Review</span>`}
      </td>
      <td>
        <span class="text-xs text-muted">
          ${c.publishedAt ? 'Published ' + new Date(c.publishedAt).toLocaleDateString() : (c.scheduledFor ? 'Scheduled ' + new Date(c.scheduledFor).toLocaleString() : 'Draft')}
        </span>
      </td>
      <td>
        <button class="btn btn-outline btn-sm btn-edit-campaign" data-id="${escapeHtml(c.id)}">Edit</button>
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
        <div class="table-thumb" style="background:${escapeHtml(c.graphicData?.bgColor || '#172C27')}; display:flex; align-items:center; justify-content:center; color:#F4F0E7; font-family:'Cormorant Garamond',serif; font-size:16px; font-weight:600;">
          A
        </div>
      </td>
      <td>
        <strong>${escapeHtml(c.title)}</strong>
        <div class="text-xs text-muted">${escapeHtml(c.serviceCategory)}</div>
      </td>
      <td>${(c.platforms || []).map(p => `<span class="badge">${escapeHtml(p)}</span>`).join(' ')}</td>
      <td>
        ${c.approval?.approved
          ? `<span class="badge badge-approved">&check; Approved (${new Date(c.approval.approvedAt).toLocaleDateString()})</span>`
          : `<span class="badge badge-draft">Draft</span>`}
      </td>
      <td><span class="badge badge-${escapeHtml(c.status)}">${escapeHtml(c.status.toUpperCase())}</span></td>
      <td><span class="text-xs text-muted">${new Date(c.updatedAt).toLocaleString()}</span></td>
      <td>
        <div style="display:flex; gap:6px;">
          <button class="btn btn-outline btn-sm btn-open-editor" data-id="${escapeHtml(c.id)}">Edit</button>
          <button class="btn btn-ghost-danger btn-sm btn-delete-campaign" data-id="${escapeHtml(c.id)}">Delete</button>
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
document.getElementById('btn-refresh-overview').addEventListener('click', () => {
  fetchCampaigns();
  fetchInquiries();
});

async function deleteCampaign(id) {
  try {
    const res = await authFetch(`/api/campaigns/${encodeURIComponent(id)}`, {
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
    showAlert('Generated 3 campaign variations for ALLORA.', 'success');
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
        <span class="variation-name">Variation ${index + 1}: ${escapeHtml(v.variationName || 'Concept')}</span>
        <button class="btn btn-primary btn-sm btn-use-variation" data-index="${index}">
          Load Into Editor &rarr;
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
        hashtags: chosen.hashtags || ['#ALLORA', '#Sylhet', '#LifeMadeLighter'],
        graphicData: chosen.recommendedGraphic || {
          headline: chosen.headline,
          subhead: 'ALLORA • Sylhet',
          accentColor: '#B49A70',
          bgColor: '#172C27',
          textColor: '#F4F0E7',
          badgeText: 'Sylhet Concierge'
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
          showAlert('Loaded into Editor. Review, refine, and approve when ready.', 'success');
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
      <div class="callout-icon">&check;</div>
      <div class="callout-body">
        <strong>Campaign Approved</strong>
        <p>Approved by ${escapeHtml(activeCampaign.approval.approvedBy || 'Admin')} on ${new Date(activeCampaign.approval.approvedAt).toLocaleDateString()}. Publishing and scheduling controls are unlocked.</p>
      </div>
    `;
  } else {
    approvalBadge.className = 'badge badge-draft';
    approvalBadge.textContent = 'Unapproved';
    btnApproval.className = 'btn btn-warning';
    btnApproval.textContent = 'Approve Campaign';
    btnPublish.disabled = true;
    btnSchedule.disabled = true;
    callout.className = 'approval-callout pending';
    callout.innerHTML = `
      <div class="callout-icon">!</div>
      <div class="callout-body">
        <strong>Approval Required</strong>
        <p>This campaign is in <em>${escapeHtml(activeCampaign.status.toUpperCase())}</em> mode. Publishing and scheduling remain locked until explicit approval is granted.</p>
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

  const catSelect = document.getElementById('editor-service-category');
  catSelect.value = activeCampaign.serviceCategory || 'Personal Concierge';
  if (!catSelect.value) catSelect.value = 'Personal Concierge';

  // Platforms
  const plats = activeCampaign.platforms || ['facebook', 'instagram'];
  document.getElementById('plat-facebook').checked = plats.includes('facebook');
  document.getElementById('plat-instagram').checked = plats.includes('instagram');

  // Graphic Controls
  const g = activeCampaign.graphicData || {};
  document.getElementById('editor-aspect-ratio').value = activeCampaign.aspectRatio || '1:1';
  document.getElementById('editor-graphic-badge').value = g.badgeText || 'Sylhet Concierge';
  document.getElementById('editor-graphic-headline').value = g.headline || activeCampaign.headline || 'Your day, handled with care.';
  document.getElementById('editor-graphic-subhead').value = g.subhead || 'Personal Concierge • Local Assistance • Business & Digital Solutions';
  document.getElementById('editor-graphic-accent').value = g.accentColor || '#B49A70';
  document.getElementById('editor-graphic-bg').value = g.bgColor || '#172C27';
  syncColorHexLabels();

  updateLivePreviewText();
  renderCanvas();
}

function syncColorHexLabels() {
  const accentInput = document.getElementById('editor-graphic-accent');
  const bgInput = document.getElementById('editor-graphic-bg');
  const accentHex = accentInput?.parentElement?.querySelector('.color-hex');
  const bgHex = bgInput?.parentElement?.querySelector('.color-hex');
  if (accentHex && accentInput) accentHex.textContent = accentInput.value.toUpperCase();
  if (bgHex && bgInput) bgHex.textContent = bgInput.value.toUpperCase();
}

function updateLivePreviewText() {
  if (!activeCampaign) return;

  const headline = document.getElementById('editor-headline').value;
  const hook = document.getElementById('editor-hook').value;
  const body = document.getElementById('editor-body').value;
  const cta = document.getElementById('editor-cta').value;
  const tags = document.getElementById('editor-hashtags').value;

  const fullText = `${headline ? headline + '\n\n' : ''}${hook ? hook + '\n\n' : ''}${body ? body + '\n\n' : ''}${cta ? cta + '\n\n' : ''}${tags}`;

  document.getElementById('fb-preview-text').textContent = fullText;
  document.getElementById('ig-preview-text').textContent = fullText;
}

['editor-headline', 'editor-hook', 'editor-body', 'editor-cta', 'editor-hashtags'].forEach(id => {
  document.getElementById(id).addEventListener('input', updateLivePreviewText);
});

['editor-graphic-badge', 'editor-graphic-headline', 'editor-graphic-subhead', 'editor-graphic-accent', 'editor-graphic-bg', 'editor-aspect-ratio'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    syncColorHexLabels();
    renderCanvas();
  });
});

// ALLORA Color Preset Themes
document.getElementById('editor-graphic-theme').addEventListener('change', (e) => {
  const theme = e.target.value;
  const accentInput = document.getElementById('editor-graphic-accent');
  const bgInput = document.getElementById('editor-graphic-bg');

  if (theme === 'forest_gold') {
    accentInput.value = '#B49A70';
    bgInput.value = '#172C27';
  } else if (theme === 'ivory_forest') {
    accentInput.value = '#172C27';
    bgInput.value = '#F4F0E7';
  } else if (theme === 'sage_forest') {
    accentInput.value = '#A6AEA0';
    bgInput.value = '#172C27';
  } else if (theme === 'modern_dark') {
    accentInput.value = '#B49A70';
    bgInput.value = '#292B29';
  }
  syncColorHexLabels();
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
function isLightHex(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  if (!m) return false;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return (r * 0.299 + g * 0.587 + b * 0.114) > 165;
}

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
  const accentColor = document.getElementById('editor-graphic-accent').value || '#B49A70';
  const bgColor = document.getElementById('editor-graphic-bg').value || '#172C27';
  const lightSurface = !customImageObj && isLightHex(bgColor);

  const primaryInk = lightSurface ? '#172C27' : '#F4F0E7';
  const secondaryInk = lightSurface ? '#292B29' : '#D9D3C7';
  const lineHairline = lightSurface ? 'rgba(23, 44, 39, 0.12)' : 'rgba(244, 240, 231, 0.1)';

  // Background Fill
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  if (customImageObj) {
    const hRatio = width / customImageObj.width;
    const vRatio = height / customImageObj.height;
    const ratio = Math.max(hRatio, vRatio);
    const centerShift_x = (width - customImageObj.width * ratio) / 2;
    const centerShift_y = (height - customImageObj.height * ratio) / 2;
    ctx.drawImage(
      customImageObj,
      0,
      0,
      customImageObj.width,
      customImageObj.height,
      centerShift_x,
      centerShift_y,
      customImageObj.width * ratio,
      customImageObj.height * ratio
    );

    const overlay = ctx.createLinearGradient(0, 0, 0, height);
    overlay.addColorStop(0, 'rgba(23, 44, 39, 0.65)');
    overlay.addColorStop(0.55, 'rgba(23, 44, 39, 0.45)');
    overlay.addColorStop(1, 'rgba(23, 44, 39, 0.92)');
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, width, height);
  } else {
    // Editorial architectural framing & subtle ambient radial warmth
    ctx.save();
    const grad = ctx.createRadialGradient(width * 0.85, height * 0.15, 40, width * 0.85, height * 0.15, 520);
    grad.addColorStop(0, hexToRgba(accentColor, lightSurface ? 0.16 : 0.25));
    grad.addColorStop(1, hexToRgba(accentColor, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    // Inner editorial hairline frame
    ctx.strokeStyle = lineHairline;
    ctx.lineWidth = 2;
    ctx.strokeRect(42, 42, width - 84, height - 84);
  }

  const topMargin = 84;
  const leftMargin = 84;

  // Draw Header Emblem & ALLORA Brand Wordmark
  if (brandLogoImg.complete && brandLogoImg.naturalWidth !== 0) {
    ctx.save();
    roundRect(ctx, leftMargin, topMargin, 64, 64, 8);
    ctx.clip();
    ctx.drawImage(brandLogoImg, leftMargin, topMargin, 64, 64);
    ctx.restore();
  }

  ctx.fillStyle = primaryInk;
  ctx.font = '600 34px "Cormorant Garamond", Georgia, serif';
  ctx.fillText('ALLORA', leftMargin + 82, topMargin + 32);

  ctx.fillStyle = accentColor;
  ctx.font = '500 18px "Manrope", sans-serif';
  ctx.fillText('Life, made lighter.', leftMargin + 82, topMargin + 58);

  // Subtle Editorial Kicker Tag
  if (badgeText) {
    const badgeY = topMargin + 128;
    ctx.font = '600 18px "Manrope", sans-serif';
    const label = badgeText.toUpperCase();
    const textWidth = ctx.measureText(label).width;
    const badgeWidth = textWidth + 36;
    const badgeHeight = 40;

    ctx.fillStyle = hexToRgba(accentColor, lightSurface ? 0.14 : 0.2);
    roundRect(ctx, leftMargin, badgeY, badgeWidth, badgeHeight, 4);
    ctx.fill();

    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1.5;
    roundRect(ctx, leftMargin, badgeY, badgeWidth, badgeHeight, 4);
    ctx.stroke();

    ctx.fillStyle = lightSurface ? '#172C27' : '#F4F0E7';
    ctx.fillText(label, leftMargin + 18, badgeY + 26);
  }

  // Editorial Serif Headline
  const headlineY = topMargin + 250;
  ctx.fillStyle = primaryInk;
  ctx.font = '600 66px "Cormorant Garamond", Georgia, serif';
  const maxHeadlineWidth = width - (leftMargin * 2);
  const headlineLines = wrapText(ctx, headline, maxHeadlineWidth);

  let currentY = headlineY;
  headlineLines.forEach((line) => {
    ctx.fillText(line, leftMargin, currentY);
    currentY += 78;
  });

  // Clean Sans Subhead
  if (subhead) {
    currentY += 20;
    ctx.fillStyle = secondaryInk;
    ctx.font = '400 28px "Manrope", sans-serif';
    const subheadLines = wrapText(ctx, subhead, maxHeadlineWidth);
    subheadLines.forEach((line) => {
      ctx.fillText(line, leftMargin, currentY);
      currentY += 42;
    });
  }

  // Bottom Contact Card
  const cardHeight = 112;
  const cardY = height - cardHeight - 72;
  const cardWidth = width - (leftMargin * 2);

  ctx.fillStyle = lightSurface ? 'rgba(23, 44, 39, 0.94)' : 'rgba(15, 31, 27, 0.72)';
  roundRect(ctx, leftMargin, cardY, cardWidth, cardHeight, 6);
  ctx.fill();

  ctx.strokeStyle = hexToRgba(accentColor, 0.45);
  ctx.lineWidth = 1.5;
  roundRect(ctx, leftMargin, cardY, cardWidth, cardHeight, 6);
  ctx.stroke();

  ctx.fillStyle = '#B49A70';
  ctx.font = '700 18px "Manrope", sans-serif';
  ctx.fillText('SYLHET CONCIERGE & ASSISTANCE', leftMargin + 32, cardY + 40);

  ctx.fillStyle = '#F4F0E7';
  ctx.font = '500 26px "Manrope", sans-serif';
  ctx.fillText('WhatsApp: +880 1865-383565', leftMargin + 32, cardY + 80);
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
  return `rgba(180,154,112,${alpha})`;
}

// Download Graphic Button
document.getElementById('btn-download-graphic').addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = `ALLORA-${(activeCampaign?.title || 'graphic').toLowerCase().replace(/\s+/g, '-')}.png`;
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
    textColor: '#F4F0E7'
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
    const res = await authFetch(`/api/campaigns/${encodeURIComponent(activeCampaign.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const d = await res.json();
    if (d.success) {
      if (d.approvalRevoked) {
        showAlert('Content was modified: Previous approval has been invalidated and status reset to Draft. Re-approval is required before publishing.', 'warning', 8000);
      } else {
        showAlert('Draft saved successfully.', 'success');
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
    if (confirm('Are you sure you want to revoke approval? This will lock the Publish and Schedule buttons.')) {
      revokeApproval();
    }
  } else {
    document.getElementById('approval-modal-title').textContent = activeCampaign.title;
    document.getElementById('approval-modal-category').textContent = `Category: ${activeCampaign.serviceCategory}`;
    modalApproval.classList.remove('hidden');
  }
});

btnConfirmApproval.addEventListener('click', async () => {
  modalApproval.classList.add('hidden');
  try {
    const res = await authFetch(`/api/campaigns/${encodeURIComponent(activeCampaign.id)}/approve`, {
      method: 'POST'
    });
    const d = await res.json();
    if (d.success) {
      showAlert('Campaign explicitly approved. Publish and Schedule controls are now unlocked.', 'success');
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
    const res = await authFetch(`/api/campaigns/${encodeURIComponent(activeCampaign.id)}/revoke-approval`, {
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
    const res = await authFetch(`/api/campaigns/${encodeURIComponent(activeCampaign.id)}/publish`, {
      method: 'POST'
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Publishing failed');
    }

    modalPublish.classList.add('hidden');
    showAlert('Post published successfully to Meta social channels.', 'success');
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
    const res = await authFetch(`/api/campaigns/${encodeURIComponent(activeCampaign.id)}/schedule`, {
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
    document.getElementById(target)?.classList.add('hidden');
  });
});

// ----------------- SOCIAL ACCOUNTS / META CONFIG -----------------
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
    hint.textContent = 'No token stored. Paste your Meta Page Access Token when ready.';
  }

  const statusChanFb = document.getElementById('status-chan-fb');
  const cardChanFb = document.getElementById('card-chan-fb');
  const statusChanIg = document.getElementById('status-chan-ig');
  const cardChanIg = document.getElementById('card-chan-ig');

  if (metaSettings.metaConnected) {
    badge.className = 'connection-pill online';
    badgeText.textContent = `Connected: ${metaSettings.pageName || 'Facebook Page'}`;
    topbarMetaStatus.innerHTML = '<span class="status-indicator success"></span><span>Meta: Connected</span>';
    navMetaDot.className = 'connection-status-dot online';

    if (statusChanFb && cardChanFb) {
      cardChanFb.classList.add('active');
      statusChanFb.innerHTML = '<span class="badge-active">&check; Active / Connected</span>';
    }
    if (statusChanIg && cardChanIg && metaSettings.instagramAccountId) {
      cardChanIg.classList.add('active');
      statusChanIg.innerHTML = '<span class="badge-active">&check; Active / Linked</span>';
    }
  } else {
    badge.className = 'connection-pill offline';
    badgeText.textContent = 'Pending Credentials';
    topbarMetaStatus.innerHTML = '<span class="status-indicator warning"></span><span>Meta: Pending Credentials</span>';
    navMetaDot.className = 'connection-status-dot offline';

    if (statusChanFb && cardChanFb) {
      cardChanFb.classList.remove('active');
      statusChanFb.innerHTML = '<span class="badge-pending">Pending Token / Page ID</span>';
    }
    if (statusChanIg && cardChanIg) {
      cardChanIg.classList.remove('active');
      statusChanIg.innerHTML = '<span class="badge-pending">Pending Token &amp; Account ID</span>';
    }
  }

  const webhookPill = document.getElementById('webhook-status-pill');
  const webhookLabel = document.getElementById('webhook-status-label');
  if (webhookPill && webhookLabel && metaSettings.webhookConfig) {
    if (metaSettings.webhookConfig.verifyTokenConfigured && metaSettings.webhookConfig.appSecretConfigured) {
      webhookPill.className = 'connection-pill online';
      webhookLabel.textContent = 'Ready (Active)';
    } else {
      webhookPill.className = 'connection-pill offline';
      webhookLabel.textContent = 'Pending Env Vars';
    }
  }
}

let tokenMasked = true;
document.getElementById('btn-toggle-token-mask').addEventListener('click', () => {
  const tokenInput = document.getElementById('setting-page-access-token');
  tokenMasked = !tokenMasked;
  tokenInput.type = tokenMasked ? 'password' : 'text';
  document.getElementById('btn-toggle-token-mask').textContent = tokenMasked ? 'Show' : 'Hide';
});

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
      showAlert('Meta configuration saved.', 'success');
      document.getElementById('setting-page-access-token').value = '';
      await fetchMetaSettings();
    }
  } catch (err) {
    showAlert('Error saving settings: ' + err.message, 'danger');
  }
});

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
        <strong>&check; Meta Connection Verified</strong><br />
        Connected Page: <strong>${escapeHtml(d.pageInfo.name)}</strong> (ID: ${escapeHtml(d.pageInfo.id)})<br />
        Category: ${escapeHtml(d.pageInfo.category)}<br />
        Graph API: ${escapeHtml(d.graphApiVersion || 'v26.0')}<br />
        Status: Token verified and ready for publishing.
      `;
      showAlert(`Verified Meta Page "${d.pageInfo.name}".`, 'success');
    } else {
      resultBox.className = 'test-result-box error';
      resultBox.innerHTML = `
        <strong>Connection Pending / Failed:</strong> ${escapeHtml(d.error)}<br />
        <small class="text-muted">Ensure your Page Access Token is valid and includes pages_manage_posts and instagram_content_publish permissions.</small>
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
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const btnCheckWebhook = document.getElementById('btn-check-webhook-status');
if (btnCheckWebhook) {
  btnCheckWebhook.addEventListener('click', async () => {
    const spinner = document.getElementById('webhook-check-spinner');
    const feedback = document.getElementById('webhook-status-feedback');
    btnCheckWebhook.disabled = true;
    if (spinner) spinner.classList.remove('hidden');
    if (feedback) feedback.classList.add('hidden');

    try {
      const res = await fetch('/webhooks/instagram/status');
      const data = await res.json();
      if (feedback) {
        feedback.classList.remove('hidden');
        const isReady = data.status === 'ready';
        feedback.className = `test-result-box ${isReady ? 'success' : 'warning'}`;
        feedback.innerHTML = `
          <strong>${isReady ? '&check; Webhook Endpoint Ready' : 'Configuration Required'}</strong><br />
          Endpoint: <code>${escapeHtml(data.endpoint)}</code><br />
          Verification Token: <strong>${data.configuration.verifyTokenConfigured ? 'Configured (&check;)' : 'Pending (Set META_WEBHOOK_VERIFY_TOKEN)'}</strong><br />
          App Secret: <strong>${data.configuration.appSecretConfigured ? 'Configured (&check;)' : 'Pending (Set META_APP_SECRET)'}</strong><br />
          <small class="text-muted mt-1" style="display:block;">${escapeHtml(data.message)}</small>
        `;
      }
    } catch (err) {
      if (feedback) {
        feedback.classList.remove('hidden');
        feedback.className = 'test-result-box error';
        feedback.innerHTML = `<strong>Error:</strong> ${escapeHtml(err.message)}`;
      }
    } finally {
      btnCheckWebhook.disabled = false;
      if (spinner) spinner.classList.add('hidden');
    }
  });
}

// ----------------- DATA PERSISTENCE & BACKUP -----------------
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
      a.download = `allora-workspace-backup-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
      showAlert('Full JSON backup downloaded.', 'success');
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
        showAlert(data.message, 'success');
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
        showAlert('Administrator passcode updated.', 'success');
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
