import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs
} from 'firebase/firestore';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const CAMPAIGNS_FILE = path.join(DATA_DIR, 'campaigns.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

// Meta Graph API active supported version (v26.0 current; v19.0/v20.0 retired)
const META_GRAPH_VERSION = 'v26.0';

// Priority 1: Strictly authorized admin emails
const AUTHORIZED_ADMIN_EMAILS = [
  'orghosimsung@gmail.com',
  'orghosung@gmail.com',
  (process.env.ADMIN_EMAIL || '').trim().toLowerCase()
].filter(Boolean);

function isAuthorizedAdminEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return AUTHORIZED_ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

// Cryptographic session secret
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || crypto.randomBytes(32).toString('hex');

// In-memory brute-force protection
const loginAttempts = new Map(); // ip -> { count, lockedUntil }

// Priority 4: Publishing concurrency mutex locks to prevent duplicate publication race conditions
const activePublishingLocks = new Set();

// Startup Admin Passcode management
// If ADMIN_PASSCODE is not set in environment, generate a secure random one for initial boot
let dynamicAdminPasscode = process.env.ADMIN_PASSCODE ? process.env.ADMIN_PASSCODE.trim() : null;
if (!dynamicAdminPasscode) {
  // Check if previously stored generated hash exists in settings
  const currentSettings = fs.existsSync(SETTINGS_FILE) ? JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) : {};
  if (currentSettings.adminPasscodeHash && currentSettings.adminPasscodeSalt) {
    // Hashed credentials present
  } else {
    // Generate secure temporary passcode
    dynamicAdminPasscode = 'LBH-' + crypto.randomBytes(8).toString('hex') + '!' + Math.floor(100 + Math.random() * 900);
    console.log('\n=============================================================');
    console.log('[SECURITY NOTICE] No ADMIN_PASSCODE environment variable detected.');
    console.log(`Generated secure administrator passcode for ${AUTHORIZED_ADMIN_EMAIL}:`);
    console.log(`>>> ${dynamicAdminPasscode} <<<`);
    console.log('To persist a permanent passcode, set ADMIN_PASSCODE in your environment/.env.');
    console.log('=============================================================\n');
  }
}

// Atomic file writing helper to prevent data corruption during server restarts/crashes
function writeJsonAtomic(filePath, data) {
  const tmpFile = `${filePath}.tmp.${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpFile, filePath);
    return true;
  } catch (err) {
    console.error(`Atomic write failed for ${filePath}:`, err);
    try {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    } catch (_) {}
    return false;
  }
}

function readJson(file) {
  try {
    if (!fs.existsSync(file)) return null;
    const data = fs.readFileSync(file, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`Error reading ${file}:`, err);
    return null;
  }
}

// Initialize storage files if they don't exist
function initStorage() {
  if (!fs.existsSync(CAMPAIGNS_FILE)) {
    const defaultCampaigns = [
      {
        id: 'camp-welcome-sylhet',
        title: 'Sylhet Local Errands & Assistance Campaign',
        serviceCategory: 'Local Assistance',
        targetAudience: 'Sylhet Residents & Expatriate Families',
        goal: 'Brand Awareness & WhatsApp Inquiries',
        aspectRatio: '1:1',
        headline: 'Need something taken care of in Sylhet?',
        hook: 'From hospital visits to grocery pickups and bill payments, we have got you covered.',
        bodyCopy: 'Life gets busy, but you don\'t have to handle everything alone. Little Big Help provides trustworthy, verified local hands right across Sylhet. Whether you are living locally or taking care of family from abroad, tell us what you need.\n\n✓ Transparent pricing\n✓ Real-time task updates on WhatsApp\n✓ Fast and dependable assistance',
        callToAction: 'Message us on WhatsApp to discuss your task today!',
        hashtags: ['#Sylhet', '#LittleBigHelp', '#SylhetServices', '#LocalHelp', '#SmallTasksBigRelief'],
        graphicData: {
          bannerType: 'services_highlight',
          headline: 'Your Reliable Hands in Sylhet',
          subhead: 'Errands • Pickups • Local Support',
          accentColor: '#F26A5A',
          bgColor: '#2C3E50',
          textColor: '#FFFFFF',
          badgeText: 'Verified Local Service'
        },
        status: 'draft',
        approval: {
          approved: false,
          approvedAt: null,
          approvedBy: null
        },
        platforms: ['facebook', 'instagram'],
        scheduledFor: null,
        publishedAt: null,
        metaPublishResult: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'camp-web-dev',
        title: 'New Service: Website Design for Small Businesses',
        serviceCategory: 'Website Design & Development',
        targetAudience: 'Local Shop Owners, Doctors, Consultants & Entrepreneurs',
        goal: 'Lead Generation',
        aspectRatio: '1:1',
        headline: 'Give Your Business a Professional Website',
        hook: 'Stop losing customers to outdated pages or broken contact forms.',
        bodyCopy: 'Little Big Help now builds clean, modern, and lightning-fast websites tailored for Sylhet businesses and service providers.\n\n• Mobile-optimized and responsive\n• Direct WhatsApp chat integration for instant customer inquiries\n• Fast delivery with transparent pricing\n• Optional monthly maintenance & updates\n\nLet\'s build a website you are proud to share.',
        callToAction: 'Chat on WhatsApp: +880 1865-383565 to discuss your website project.',
        hashtags: ['#WebsiteDesignSylhet', '#LittleBigHelp', '#WebDevelopment', '#SylhetBusiness', '#GrowOnline'],
        graphicData: {
          bannerType: 'web_launch',
          headline: 'Modern Websites for Sylhet Businesses',
          subhead: 'Built fast. Designed for results. Easy maintenance.',
          accentColor: '#28A745',
          bgColor: '#1E293B',
          textColor: '#FFFFFF',
          badgeText: 'New Service Launch'
        },
        status: 'draft',
        approval: {
          approved: false,
          approvedAt: null,
          approvedBy: null
        },
        platforms: ['facebook', 'instagram'],
        scheduledFor: null,
        publishedAt: null,
        metaPublishResult: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
    writeJsonAtomic(CAMPAIGNS_FILE, defaultCampaigns);
  }

  if (!fs.existsSync(SETTINGS_FILE)) {
    const defaultSettings = {
      authorizedAdminEmail: AUTHORIZED_ADMIN_EMAIL,
      facebookPageId: process.env.META_PAGE_ID || '',
      instagramAccountId: process.env.META_INSTAGRAM_ACCOUNT_ID || '',
      metaAppId: process.env.META_APP_ID || '',
      metaPageAccessToken: process.env.META_PAGE_ACCESS_TOKEN || '',
      metaConnected: false,
      lastCheckedAt: null,
      timezone: 'Asia/Dhaka'
    };
    writeJsonAtomic(SETTINGS_FILE, defaultSettings);
  }

  if (!fs.existsSync(SESSIONS_FILE)) {
    writeJsonAtomic(SESSIONS_FILE, {});
  }
}

initStorage();

// ----------------- FIRESTORE PERSISTENT CLOUD STORAGE -----------------
let firestoreDb = null;
const firestoreStatus = { connected: false, databaseId: null, error: null };

try {
  const firebaseConfigPath = path.join(__dirname, 'firebase-applet-config.json');
  if (fs.existsSync(firebaseConfigPath)) {
    const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));
    const firebaseApp = initializeApp(firebaseConfig);
    const dbId = firebaseConfig.firestoreDatabaseId || '(default)';
    firestoreDb = getFirestore(firebaseApp, dbId);
    firestoreStatus.databaseId = dbId;
    console.log('[Firestore] Connected to persistent database:', dbId);
  }
} catch (err) {
  console.warn('[Firestore] Initialization warning:', err.message);
  firestoreStatus.error = err.message;
}

async function getStoredCampaigns() {
  if (firestoreDb) {
    try {
      const snap = await getDocs(collection(firestoreDb, 'campaigns'));
      if (snap.docs.length > 0) {
        const campaigns = snap.docs.map(d => d.data());
        campaigns.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        firestoreStatus.connected = true;
        writeJsonAtomic(CAMPAIGNS_FILE, campaigns);
        return campaigns;
      }
    } catch (err) {
      console.warn('[Firestore] Error querying campaigns, using local cache:', err.message);
    }
  }
  return readJson(CAMPAIGNS_FILE) || [];
}

async function persistCampaign(campaign) {
  // 1. Update local cache
  const campaigns = readJson(CAMPAIGNS_FILE) || [];
  const idx = campaigns.findIndex(c => c.id === campaign.id);
  if (idx >= 0) {
    campaigns[idx] = campaign;
  } else {
    campaigns.unshift(campaign);
  }
  writeJsonAtomic(CAMPAIGNS_FILE, campaigns);

  // 2. Persist to Firestore
  if (firestoreDb) {
    try {
      await setDoc(doc(firestoreDb, 'campaigns', campaign.id), campaign);
      firestoreStatus.connected = true;
    } catch (err) {
      console.error(`[Firestore] Failed to persist campaign ${campaign.id}:`, err.message);
    }
  }
  return campaign;
}

async function removeStoredCampaign(campaignId) {
  // 1. Remove from local cache
  let campaigns = readJson(CAMPAIGNS_FILE) || [];
  campaigns = campaigns.filter(c => c.id !== campaignId);
  writeJsonAtomic(CAMPAIGNS_FILE, campaigns);

  // 2. Remove from Firestore
  if (firestoreDb) {
    try {
      await deleteDoc(doc(firestoreDb, 'campaigns', campaignId));
      firestoreStatus.connected = true;
    } catch (err) {
      console.error(`[Firestore] Failed to delete campaign ${campaignId}:`, err.message);
    }
  }
}

// Timing-safe string comparison to protect against timing attacks
function timingSafeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    // Fake comparison to avoid timing leak on length
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

// Secure cryptographic passcode hashing using scrypt (no plaintext storage)
function hashPasscode(passcode, salt = null) {
  if (!salt) {
    salt = crypto.randomBytes(16).toString('hex');
  }
  const hash = crypto.scryptSync(passcode, salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPasscode(enteredPasscode) {
  const cleanEntered = enteredPasscode ? enteredPasscode.trim() : '';
  if (!cleanEntered) return false;

  const settings = readJson(SETTINGS_FILE) || {};

  // 1. Check cryptographically hashed credentials in settings
  if (settings.adminPasscodeHash && settings.adminPasscodeSalt) {
    try {
      const computed = crypto.scryptSync(cleanEntered, settings.adminPasscodeSalt, 64).toString('hex');
      if (timingSafeCompare(computed, settings.adminPasscodeHash)) {
        return true;
      }
    } catch (_) {}
  }

  // 2. Check environment variable
  if (process.env.ADMIN_PASSCODE && timingSafeCompare(cleanEntered, process.env.ADMIN_PASSCODE.trim())) {
    return true;
  }

  // 3. Check dynamic runtime fallback
  if (dynamicAdminPasscode && timingSafeCompare(cleanEntered, dynamicAdminPasscode.trim())) {
    return true;
  }

  return false;
}

// Priority 2: Protect private data directory from ANY direct public HTTP access
app.use('/data', (req, res) => {
  return res.status(403).json({
    error: 'Access forbidden: Internal database files cannot be accessed via public web routes.'
  });
});

// Middleware
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(cookieParser(SESSION_SECRET));

// Priority 1: Secure Session Management & Expiration (30 Days Persistent Lifetime)
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

async function getActiveSessionAsync(req) {
  // Check httpOnly cookie first, then Bearer header
  let token = req.cookies?.lbh_admin_session;
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
  }

  if (!token) return null;

  const now = Date.now();
  let session = null;

  // 1. Check local cache
  const sessions = readJson(SESSIONS_FILE) || {};
  if (sessions[token]) {
    session = sessions[token];
  }

  // 2. Check Firestore if not found locally (survives container restarts/redeployments)
  if (!session && firestoreDb) {
    try {
      const snap = await getDoc(doc(firestoreDb, 'sessions', token));
      if (snap.exists()) {
        session = snap.data();
        sessions[token] = session;
        writeJsonAtomic(SESSIONS_FILE, sessions);
      }
    } catch (err) {
      console.warn('[Firestore] Session recovery lookup notice:', err.message);
    }
  }

  if (!session) return null;

  // Check 30-day lifetime expiry
  if (now - session.createdAt > SESSION_LIFETIME_MS) {
    delete sessions[token];
    writeJsonAtomic(SESSIONS_FILE, sessions);
    if (firestoreDb) {
      deleteDoc(doc(firestoreDb, 'sessions', token)).catch(() => {});
    }
    return null;
  }

  // Update sliding activity timestamp
  session.lastActiveAt = now;
  sessions[token] = session;
  writeJsonAtomic(SESSIONS_FILE, sessions);

  return { ...session, token };
}

function getActiveSession(req) {
  let token = req.cookies?.lbh_admin_session;
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
  }

  if (!token) return null;

  const sessions = readJson(SESSIONS_FILE) || {};
  const session = sessions[token];
  if (!session) return null;

  const now = Date.now();
  if (now - session.createdAt > SESSION_LIFETIME_MS) {
    delete sessions[token];
    writeJsonAtomic(SESSIONS_FILE, sessions);
    return null;
  }

  session.lastActiveAt = now;
  sessions[token] = session;
  return { ...session, token };
}

async function requireAdmin(req, res, next) {
  const session = await getActiveSessionAsync(req);
  if (!session || !session.isAdmin || !isAuthorizedAdminEmail(session.email)) {
    return res.status(401).json({
      error: 'Unauthorized: Administrator authentication required.',
      code: 'UNAUTHORIZED_ADMIN'
    });
  }
  req.adminSession = session;
  next();
}

// ----------------- AUTH ENDPOINTS (Priority 1) -----------------
app.post('/api/auth/login', (req, res) => {
  const clientIp = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();

  // Brute-force check
  const attemptInfo = loginAttempts.get(clientIp) || { count: 0, lockedUntil: 0 };
  if (attemptInfo.lockedUntil > now) {
    const remainingSeconds = Math.ceil((attemptInfo.lockedUntil - now) / 1000);
    return res.status(429).json({
      error: `Too many failed login attempts. Account temporarily locked. Please try again in ${remainingSeconds} seconds.`
    });
  }

  const { email, passcode } = req.body;
  if (!email || !passcode) {
    return res.status(400).json({ error: 'Both administrator email and passcode are required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Strict administrator email check
  if (!isAuthorizedAdminEmail(normalizedEmail)) {
    attemptInfo.count += 1;
    if (attemptInfo.count >= 5) {
      attemptInfo.lockedUntil = now + 15 * 60 * 1000; // 15-minute lockout
    }
    loginAttempts.set(clientIp, attemptInfo);

    return res.status(403).json({
      error: `Access denied. ${email} is not authorized to access this administration area.`
    });
  }

  // Verify passcode using secure hash or environment configuration
  if (!verifyPasscode(passcode)) {
    attemptInfo.count += 1;
    if (attemptInfo.count >= 5) {
      attemptInfo.lockedUntil = now + 15 * 60 * 1000;
    }
    loginAttempts.set(clientIp, attemptInfo);

    return res.status(401).json({
      error: 'Invalid administrator passcode. Please enter the correct admin secret.'
    });
  }

  // Reset login attempts on success
  loginAttempts.delete(clientIp);

  // Generate cryptographically secure random session token (Priority 1)
  const token = 'lbh_' + crypto.randomBytes(32).toString('hex');
  const sessions = readJson(SESSIONS_FILE) || {};

  const sessionData = {
    email: normalizedEmail,
    isAdmin: true,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    ip: clientIp,
    userAgent: req.headers['user-agent'] || 'unknown'
  };

  // 1. Cache session locally
  sessions[token] = sessionData;
  writeJsonAtomic(SESSIONS_FILE, sessions);

  // 2. Persist session to Firestore (survives container restarts/redeployments)
  if (firestoreDb) {
    try {
      await setDoc(doc(firestoreDb, 'sessions', token), sessionData);
    } catch (err) {
      console.warn('[Firestore] Session persist notice:', err.message);
    }
  }

  // 3. Set persistent, secure 30-day httpOnly session cookie
  const isHttps = Boolean(req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production');
  res.cookie('lbh_admin_session', token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'lax',
    maxAge: SESSION_LIFETIME_MS,
    expires: new Date(Date.now() + SESSION_LIFETIME_MS),
    path: '/'
  });

  // Handle standard form submit vs AJAX fetch
  if (req.is('application/x-www-form-urlencoded') || (req.headers.accept && !req.headers.accept.includes('application/json') && !req.is('json'))) {
    return res.redirect('/admin');
  }

  // Never return token in JSON body; authentication is strictly mediated by the httpOnly cookie
  return res.json({
    success: true,
    redirect: '/admin',
    user: {
      email: normalizedEmail,
      role: 'Administrator',
      name: 'Orgho (Little Big Help Admin)'
    }
  });
});

app.get('/api/auth/me', async (req, res) => {
  const session = await getActiveSessionAsync(req);
  if (!session || !isAuthorizedAdminEmail(session.email)) {
    return res.status(401).json({ authenticated: false });
  }
  return res.json({
    authenticated: true,
    user: {
      email: session.email,
      role: 'Administrator',
      name: 'Orgho (Little Big Help Admin)'
    }
  });
});

app.post('/api/auth/logout', async (req, res) => {
  let token = req.cookies?.lbh_admin_session;
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
  }

  if (token) {
    const sessions = readJson(SESSIONS_FILE) || {};
    delete sessions[token];
    writeJsonAtomic(SESSIONS_FILE, sessions);

    if (firestoreDb) {
      try {
        await deleteDoc(doc(firestoreDb, 'sessions', token));
      } catch (_) {}
    }
  }

  res.clearCookie('lbh_admin_session', { path: '/' });
  return res.json({ success: true, message: 'Logged out successfully' });
});

app.post('/api/auth/change-passcode', requireAdmin, (req, res) => {
  const { currentPasscode, newPasscode } = req.body;
  if (!newPasscode || newPasscode.trim().length < 8) {
    return res.status(400).json({ error: 'New passcode must be at least 8 characters long.' });
  }

  if (!verifyPasscode(currentPasscode)) {
    return res.status(401).json({ error: 'Current passcode is incorrect.' });
  }

  const cleanNewPasscode = newPasscode.trim();

  // 1. Update in-memory environment variable for immediate effect in this running process
  process.env.ADMIN_PASSCODE = cleanNewPasscode;

  // 2. Hash and persist in settings.json (never plaintext)
  const settings = readJson(SETTINGS_FILE) || {};
  const { hash, salt } = hashPasscode(cleanNewPasscode);
  settings.adminPasscodeHash = hash;
  settings.adminPasscodeSalt = salt;
  delete settings.customAdminPasscode; // Remove any plaintext passcode
  settings.passcodeUpdatedAt = new Date().toISOString();
  writeJsonAtomic(SETTINGS_FILE, settings);

  // 3. Update .env file on disk if present
  const envPath = path.join(__dirname, '.env');
  try {
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf8');
      if (envContent.includes('ADMIN_PASSCODE=')) {
        envContent = envContent.replace(/ADMIN_PASSCODE=.*/g, `ADMIN_PASSCODE="${cleanNewPasscode.replace(/"/g, '\\"')}"`);
      } else {
        envContent += `\nADMIN_PASSCODE="${cleanNewPasscode.replace(/"/g, '\\"')}"\n`;
      }
      fs.writeFileSync(envPath, envContent, 'utf8');
    }
  } catch (envErr) {
    console.error('Notice: Could not update .env file:', envErr.message);
  }

  return res.json({
    success: true,
    message: 'Administrator passcode updated successfully across running environment and persistent storage.'
  });
});

// ----------------- DATA PERSISTENCE & BACKUP (Priority 2) -----------------
app.get('/api/backup/export', requireAdmin, async (req, res) => {
  const campaigns = await getStoredCampaigns();
  const settings = readJson(SETTINGS_FILE) || {};

  // Omit sensitive secrets from export for safety
  const safeSettings = {
    authorizedAdminEmail: settings.authorizedAdminEmail,
    facebookPageId: settings.facebookPageId,
    instagramAccountId: settings.instagramAccountId,
    metaAppId: settings.metaAppId,
    hasTokenConfigured: Boolean(settings.metaPageAccessToken),
    timezone: settings.timezone
  };

  const backupPackage = {
    exportedAt: new Date().toISOString(),
    version: '1.0',
    app: 'Little Big Help Marketing Engine',
    campaigns,
    settings: safeSettings
  };

  res.setHeader('Content-Disposition', `attachment; filename="lbh-marketing-backup-${Date.now()}.json"`);
  res.setHeader('Content-Type', 'application/json');
  return res.json(backupPackage);
});

app.post('/api/backup/restore', requireAdmin, async (req, res) => {
  const { campaigns } = req.body;
  if (!Array.isArray(campaigns)) {
    return res.status(400).json({ error: 'Invalid backup format: "campaigns" array is required.' });
  }

  const existingCampaigns = await getStoredCampaigns();
  const mergedMap = new Map();

  existingCampaigns.forEach(c => mergedMap.set(c.id, c));
  for (const c of campaigns) {
    if (c.id && c.title) {
      const updatedCampaign = {
        ...c,
        updatedAt: new Date().toISOString()
      };
      mergedMap.set(c.id, updatedCampaign);
      await persistCampaign(updatedCampaign);
    }
  }

  const merged = Array.from(mergedMap.values());

  return res.json({
    success: true,
    message: `Restored ${campaigns.length} campaigns successfully. Total campaigns: ${merged.length}.`,
    totalCampaigns: merged.length
  });
});

// ----------------- GEMINI AI GENERATION -----------------
app.post('/api/gemini/generate-campaign', requireAdmin, async (req, res) => {
  try {
    const {
      serviceCategory,
      customTopic,
      targetAudience,
      promotionalGoal,
      tone,
      language
    } = req.body;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: 'GEMINI_API_KEY is not configured on the server environment. Please set GEMINI_API_KEY in your server configuration.'
      });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });

    const prompt = `
You are the senior marketing director and copywriter for "Little Big Help", a trusted local concierge, errand, and business assistance company based in Sylhet, Bangladesh.
Tagline: "Small Tasks, Big Relief".
Brand values: friendly, trustworthy, clear pricing, warm, stress-free, reliable.
Official WhatsApp: +880 1865-383565.
Official Email: littlebighelp28@gmail.com.

Services offered:
1. Everyday Help (grocery shopping, household errands, bill payments, pharmacy pickups)
2. Local Assistance in Sylhet (guiding visitors, doctor appointments, airport reception, elderly family check-ins)
3. Business Support (document delivery, supplier pickups, administrative tasks, local coordination)
4. Website Design & Development (modern, fast websites for local businesses, shops, and entrepreneurs with optional ongoing maintenance)
5. Custom Requests (unique personal or commercial requests assessed individually)

Generate a high-converting social media marketing campaign with 3 creative variations tailored for Facebook and Instagram.

Campaign Parameters:
- Selected Category: ${serviceCategory || 'All Services / Brand Awareness'}
- Specific Topic / Offer: ${customTopic || 'Everyday reliable assistance and peace of mind'}
- Target Audience: ${targetAudience || 'Sylhet residents, busy professionals, and Non-Resident Bangladeshis (NRBs) supporting family in Sylhet'}
- Promotional Goal: ${promotionalGoal || 'Generate WhatsApp inquiries and brand trust'}
- Tone: ${tone || 'Friendly, reassuring, and professional'}
- Language Style: ${language || 'English with natural Sylhet/Bengali cultural touchpoints'}

Return ONLY a valid JSON object matching this structure:
{
  "campaignConcept": "string brief summary of marketing angle",
  "variations": [
    {
      "variationName": "e.g., Direct Problem-Solver / Emotional Trust / Quick Action Offer",
      "headline": "Punchy 6-10 word headline for visual banner",
      "hook": "First 1-2 captivating sentences for social feed scroll-stopping",
      "bodyCopy": "Clear, formatted body with bullet points (using • or ✓) and emotional relief message",
      "callToAction": "Specific call to action urging WhatsApp chat",
      "hashtags": ["#Sylhet", "#LittleBigHelp", "...3-5 more relevant tags"],
      "recommendedGraphic": {
        "headline": "Banner headline text",
        "subhead": "Banner subhead text",
        "accentColor": "#F26A5A",
        "bgColor": "#2C3E50",
        "textColor": "#FFFFFF",
        "badgeText": "Short badge text like 'Trusted in Sylhet' or 'Fast Delivery'"
      }
    }
  ]
}
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error('Empty response received from Gemini model.');
    }

    const parsed = JSON.parse(text);
    return res.json({ success: true, data: parsed });
  } catch (err) {
    console.error('Gemini generation error:', err);
    return res.status(500).json({
      error: 'Failed to generate campaign content: ' + (err.message || 'Unknown error')
    });
  }
});

// ----------------- CAMPAIGNS CRUD & APPROVAL GATE (Priority 4) -----------------
app.get('/api/campaigns', requireAdmin, async (req, res) => {
  const campaigns = await getStoredCampaigns();
  return res.json({ success: true, campaigns, storage: firestoreStatus });
});

app.get('/api/campaigns/:id', requireAdmin, async (req, res) => {
  const campaigns = await getStoredCampaigns();
  const campaign = campaigns.find(c => c.id === req.params.id);
  if (!campaign) {
    return res.status(404).json({ error: 'Campaign not found' });
  }
  return res.json({ success: true, campaign });
});

app.post('/api/campaigns', requireAdmin, async (req, res) => {
  const newCampaign = {
    id: 'camp-' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'),
    title: req.body.title || 'Untitled Campaign',
    serviceCategory: req.body.serviceCategory || 'Everyday Help',
    targetAudience: req.body.targetAudience || 'General Audience',
    goal: req.body.goal || 'General Awareness',
    aspectRatio: req.body.aspectRatio || '1:1',
    headline: req.body.headline || '',
    hook: req.body.hook || '',
    bodyCopy: req.body.bodyCopy || '',
    callToAction: req.body.callToAction || '',
    hashtags: req.body.hashtags || [],
    graphicData: req.body.graphicData || {
      headline: req.body.headline || 'Little Big Help',
      subhead: 'Small Tasks, Big Relief',
      accentColor: '#F26A5A',
      bgColor: '#2C3E50',
      textColor: '#FFFFFF',
      badgeText: 'Sylhet Service'
    },
    customGraphicImage: req.body.customGraphicImage || null,
    status: 'draft',
    approval: {
      approved: false,
      approvedAt: null,
      approvedBy: null
    },
    platforms: req.body.platforms || ['facebook', 'instagram'],
    scheduledFor: null,
    publishedAt: null,
    metaPublishResult: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await persistCampaign(newCampaign);
  return res.status(201).json({ success: true, campaign: newCampaign });
});

// Priority 4: Update Campaign with AUTOMATIC APPROVAL INVALIDATION on Content Modification
app.put('/api/campaigns/:id', requireAdmin, async (req, res) => {
  const campaigns = await getStoredCampaigns();
  const index = campaigns.findIndex(c => c.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Campaign not found' });
  }

  const existing = campaigns[index];

  // If already published, prevent re-editing unless duplicated into a new campaign
  if (existing.status === 'published' && req.body.status !== 'published') {
    return res.status(400).json({
      error: 'Published campaigns cannot be modified. Please duplicate this campaign to create a new editable draft.'
    });
  }

  // Detect whether content or visual creatives have changed
  const contentFields = [
    'title', 'serviceCategory', 'targetAudience', 'goal', 'aspectRatio',
    'headline', 'hook', 'bodyCopy', 'callToAction', 'hashtags',
    'graphicData', 'customGraphicImage', 'platforms'
  ];

  let contentChanged = false;
  for (const field of contentFields) {
    if (req.body[field] !== undefined && JSON.stringify(req.body[field]) !== JSON.stringify(existing[field])) {
      contentChanged = true;
      break;
    }
  }

  // Priority 4 Enforcement: Invalidate approval if content was modified
  let status = existing.status;
  let approval = existing.approval;
  let scheduledFor = existing.scheduledFor;
  let approvalRevoked = false;

  if (contentChanged && (existing.approval?.approved || existing.status === 'approved' || existing.status === 'scheduled')) {
    status = 'draft';
    approval = {
      approved: false,
      approvedAt: null,
      approvedBy: null,
      revocationReason: 'Content was modified after previous approval. Re-approval is strictly required.'
    };
    scheduledFor = null;
    approvalRevoked = true;
  }

  const updated = {
    ...existing,
    ...req.body,
    id: existing.id,
    status,
    approval,
    scheduledFor,
    updatedAt: new Date().toISOString()
  };

  await persistCampaign(updated);

  return res.json({
    success: true,
    campaign: updated,
    approvalRevoked,
    message: approvalRevoked
      ? 'Campaign updated. Content changes detected: previous approval has been automatically invalidated and status reset to Draft.'
      : 'Campaign updated successfully.'
  });
});

// Explicit Approval Gate (Priority 4)
app.post('/api/campaigns/:id/approve', requireAdmin, async (req, res) => {
  const campaigns = await getStoredCampaigns();
  const index = campaigns.findIndex(c => c.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Campaign not found' });
  }

  const campaign = campaigns[index];
  if (campaign.status === 'published') {
    return res.status(400).json({ error: 'Campaign is already published.' });
  }

  campaign.status = 'approved';
  campaign.approval = {
    approved: true,
    approvedAt: new Date().toISOString(),
    approvedBy: req.adminSession.email
  };
  campaign.updatedAt = new Date().toISOString();

  await persistCampaign(campaign);

  return res.json({
    success: true,
    campaign,
    message: `Campaign approved by ${req.adminSession.email}. Ready for publishing or scheduling.`
  });
});

// Revoke Approval Gate
app.post('/api/campaigns/:id/revoke-approval', requireAdmin, async (req, res) => {
  const campaigns = await getStoredCampaigns();
  const index = campaigns.findIndex(c => c.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Campaign not found' });
  }

  const campaign = campaigns[index];
  if (campaign.status === 'published') {
    return res.status(400).json({ error: 'Cannot revoke approval for already published campaigns.' });
  }

  campaign.status = 'draft';
  campaign.approval = {
    approved: false,
    approvedAt: null,
    approvedBy: null,
    revocationReason: 'Manually revoked by administrator'
  };
  campaign.scheduledFor = null;
  campaign.updatedAt = new Date().toISOString();

  await persistCampaign(campaign);

  return res.json({ success: true, campaign, message: 'Approval revoked. Campaign returned to draft status.' });
});

// Delete campaign
app.delete('/api/campaigns/:id', requireAdmin, async (req, res) => {
  const campaigns = await getStoredCampaigns();
  const exists = campaigns.some(c => c.id === req.params.id);
  if (!exists) {
    return res.status(404).json({ error: 'Campaign not found' });
  }
  await removeStoredCampaign(req.params.id);
  return res.json({ success: true, message: 'Campaign deleted' });
});

// Schedule campaign (Priority 4: Strict approval check)
app.post('/api/campaigns/:id/schedule', requireAdmin, async (req, res) => {
  const { scheduledTime } = req.body;
  if (!scheduledTime) {
    return res.status(400).json({ error: 'Scheduled time is required.' });
  }

  const campaigns = await getStoredCampaigns();
  const index = campaigns.findIndex(c => c.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Campaign not found' });
  }

  const campaign = campaigns[index];
  // Strict Gate Check: Must be explicitly approved first!
  if (!campaign.approval?.approved || campaign.status !== 'approved') {
    return res.status(400).json({
      error: 'Approval required: You must explicitly review and approve this campaign before it can be scheduled for publication.'
    });
  }

  campaign.status = 'scheduled';
  campaign.scheduledFor = scheduledTime;
  campaign.updatedAt = new Date().toISOString();

  await persistCampaign(campaign);
  return res.json({ success: true, campaign });
});

// ----------------- SOCIAL ACCOUNTS / META CONFIG (Priority 3: v26.0) -----------------
app.get('/api/meta/settings', requireAdmin, (req, res) => {
  const settings = readJson(SETTINGS_FILE) || {};
  // Priority 1: Never expose plaintext token to frontend; return masked representation
  const token = settings.metaPageAccessToken || process.env.META_PAGE_ACCESS_TOKEN || '';
  const maskedToken = token ? `${token.substring(0, 6)}...${token.substring(token.length - 4)}` : '';

  return res.json({
    success: true,
    settings: {
      facebookPageId: settings.facebookPageId || process.env.META_PAGE_ID || '',
      instagramAccountId: settings.instagramAccountId || process.env.META_INSTAGRAM_ACCOUNT_ID || '',
      metaAppId: settings.metaAppId || process.env.META_APP_ID || '',
      hasToken: Boolean(token),
      maskedToken,
      metaConnected: settings.metaConnected || false,
      lastCheckedAt: settings.lastCheckedAt,
      pageName: settings.pageName || null,
      timezone: settings.timezone || 'Asia/Dhaka',
      graphApiVersion: META_GRAPH_VERSION
    }
  });
});

app.post('/api/meta/settings', requireAdmin, (req, res) => {
  const { facebookPageId, instagramAccountId, metaAppId, metaPageAccessToken } = req.body;
  const settings = readJson(SETTINGS_FILE) || {};

  if (facebookPageId !== undefined) settings.facebookPageId = facebookPageId.trim();
  if (instagramAccountId !== undefined) settings.instagramAccountId = instagramAccountId.trim();
  if (metaAppId !== undefined) settings.metaAppId = metaAppId.trim();
  if (metaPageAccessToken !== undefined && metaPageAccessToken.trim() !== '') {
    settings.metaPageAccessToken = metaPageAccessToken.trim();
  }

  writeJsonAtomic(SETTINGS_FILE, settings);
  return res.json({ success: true, message: 'Meta configuration updated successfully' });
});

// Real Meta Graph API validation (Priority 3: v26.0)
app.post('/api/meta/test-connection', requireAdmin, async (req, res) => {
  const settings = readJson(SETTINGS_FILE) || {};
  const token = settings.metaPageAccessToken || process.env.META_PAGE_ACCESS_TOKEN;
  const pageId = settings.facebookPageId || process.env.META_PAGE_ID;

  if (!token) {
    return res.status(400).json({
      success: false,
      connected: false,
      error: 'No Meta Page Access Token configured. Please configure your Meta Page Access Token in Social Accounts settings.'
    });
  }

  try {
    // Call Meta Graph API v26.0
    const targetUrl = pageId 
      ? `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(pageId)}?fields=id,name,category,link,verification_status&access_token=${encodeURIComponent(token)}`
      : `https://graph.facebook.com/${META_GRAPH_VERSION}/me?fields=id,name&access_token=${encodeURIComponent(token)}`;

    const response = await fetch(targetUrl);
    const data = await response.json();

    if (data.error) {
      settings.metaConnected = false;
      settings.lastCheckedAt = new Date().toISOString();
      writeJsonAtomic(SETTINGS_FILE, settings);

      return res.status(400).json({
        success: false,
        connected: false,
        error: `Meta Graph API Error [${data.error.code || 'ERR'}]: ${data.error.message}`,
        details: data.error
      });
    }

    // Success: Genuine token verification confirmed by Meta Graph API
    settings.metaConnected = true;
    settings.lastCheckedAt = new Date().toISOString();
    settings.pageName = data.name;
    writeJsonAtomic(SETTINGS_FILE, settings);

    return res.json({
      success: true,
      connected: true,
      graphApiVersion: META_GRAPH_VERSION,
      pageInfo: {
        id: data.id,
        name: data.name,
        category: data.category || 'Local Service',
        link: data.link || null
      },
      message: `Successfully verified connection to Meta Facebook Page "${data.name}" via Graph API ${META_GRAPH_VERSION}!`
    });
  } catch (err) {
    console.error('Meta connection verification error:', err);
    return res.status(500).json({
      success: false,
      connected: false,
      error: 'Network error communicating with Meta Graph API: ' + err.message
    });
  }
});

// Helper for polling Instagram container processing status (Priority 3 Requirement)
async function pollInstagramContainerStatus(containerId, token, maxRetries = 5, delayMs = 2000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const statusUrl = `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(containerId)}?fields=status_code,status&access_token=${encodeURIComponent(token)}`;
    const statusRes = await fetch(statusUrl);
    const statusData = await statusRes.json();

    if (statusData.error) {
      return { success: false, error: statusData.error.message };
    }

    const statusCode = statusData.status_code;
    if (statusCode === 'FINISHED') {
      return { success: true, statusData };
    }

    if (statusCode === 'ERROR') {
      return { success: false, error: `Media processing failed: ${statusData.status || 'Unknown processing error'}` };
    }

    if (statusCode === 'EXPIRED') {
      return { success: false, error: 'Media container expired before publication.' };
    }

    // Still in progress: wait and retry
    if (attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return { success: false, error: 'Media processing timed out. The container was not ready within the allotted time.' };
}

// ----------------- PUBLISH TO META (Priority 3 & 4) -----------------
app.post('/api/campaigns/:id/publish', requireAdmin, async (req, res) => {
  const campaignId = req.params.id;

  // Priority 4: Prevent duplicate in-flight publication clicks/retries
  if (activePublishingLocks.has(campaignId)) {
    return res.status(409).json({
      error: 'Publication in progress: Another publish request is currently being processed for this campaign. Please wait.'
    });
  }

  activePublishingLocks.add(campaignId);

  try {
    const campaigns = readJson(CAMPAIGNS_FILE) || [];
    const index = campaigns.findIndex(c => c.id === campaignId);
    if (index === -1) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const campaign = campaigns[index];

    // Priority 4 — GATE CHECK 1: Must be explicitly approved on backend!
    if (!campaign.approval?.approved || campaign.status !== 'approved') {
      return res.status(400).json({
        error: 'Publication blocked: This campaign has not been approved. The administrator must explicitly review and approve the campaign before publishing.'
      });
    }

    // Priority 4 — GATE CHECK 2: Prevent duplicate double-publishing
    if (campaign.status === 'published') {
      return res.status(400).json({
        error: 'This campaign has already been published. To publish again, duplicate the campaign into a new draft.'
      });
    }

    const settings = readJson(SETTINGS_FILE) || {};
    const token = settings.metaPageAccessToken || process.env.META_PAGE_ACCESS_TOKEN;
    const pageId = settings.facebookPageId || process.env.META_PAGE_ID;
    const igId = settings.instagramAccountId || process.env.META_INSTAGRAM_ACCOUNT_ID;

    // Check token presence
    if (!token) {
      return res.status(400).json({
        error: 'Cannot publish: Meta Page Access Token is not configured. Please open "Social Accounts" in the admin dashboard to connect your Facebook Page / Instagram account with a valid Page Access Token.',
        requiresConfig: true
      });
    }

    // Prepare full caption
    const fullMessage = `${campaign.headline}\n\n${campaign.hook}\n\n${campaign.bodyCopy}\n\n👉 ${campaign.callToAction}\n\n${(campaign.hashtags || []).join(' ')}`;

    const results = {
      facebook: null,
      instagram: null,
      publishedAt: new Date().toISOString(),
      graphApiVersion: META_GRAPH_VERSION
    };

    let anySuccess = false;
    let publishErrors = [];

    // 1. Publish to Facebook Page (v26.0)
    if (campaign.platforms.includes('facebook')) {
      if (!pageId) {
        publishErrors.push('Facebook Page ID is missing in Social Accounts settings.');
      } else {
        try {
          const fbUrl = `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(pageId)}/feed`;
          const fbParams = new URLSearchParams({
            message: fullMessage,
            access_token: token
          });

          const fbRes = await fetch(fbUrl, {
            method: 'POST',
            body: fbParams
          });
          const fbData = await fbRes.json();

          if (fbData.error) {
            publishErrors.push(`Facebook publish failed: ${fbData.error.message}`);
            results.facebook = { success: false, error: fbData.error.message };
          } else {
            anySuccess = true;
            results.facebook = {
              success: true,
              postId: fbData.id,
              url: `https://www.facebook.com/${fbData.id}`
            };
          }
        } catch (err) {
          publishErrors.push(`Facebook network error: ${err.message}`);
          results.facebook = { success: false, error: err.message };
        }
      }
    }

    // 2. Publish to Instagram Professional Account (v26.0 + Status Polling)
    if (campaign.platforms.includes('instagram')) {
      if (!igId) {
        publishErrors.push('Instagram Account ID is not configured in Social Accounts.');
      } else {
        const imageUrl = campaign.customGraphicImage && campaign.customGraphicImage.startsWith('http')
          ? campaign.customGraphicImage
          : null;

        if (!imageUrl) {
          publishErrors.push('Instagram publishing requires a publicly accessible HTTPS image URL asset.');
          results.instagram = {
            success: false,
            error: 'Instagram Feed requires a public HTTPS image URL asset.'
          };
        } else {
          try {
            // Step 1: Create media container
            const containerUrl = `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(igId)}/media`;
            const cParams = new URLSearchParams({
              image_url: imageUrl,
              caption: fullMessage,
              access_token: token
            });
            const cRes = await fetch(containerUrl, { method: 'POST', body: cParams });
            const cData = await cRes.json();

            if (cData.error) {
              publishErrors.push(`Instagram container error: ${cData.error.message}`);
              results.instagram = { success: false, error: cData.error.message };
            } else {
              const creationId = cData.id;

              // Step 2 (Priority 3 Requirement): Poll container status until FINISHED
              const pollResult = await pollInstagramContainerStatus(creationId, token);

              if (!pollResult.success) {
                publishErrors.push(`Instagram container verification failed: ${pollResult.error}`);
                results.instagram = { success: false, error: pollResult.error };
              } else {
                // Step 3: Publish container
                const pubUrl = `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(igId)}/media_publish`;
                const pParams = new URLSearchParams({
                  creation_id: creationId,
                  access_token: token
                });
                const pRes = await fetch(pubUrl, { method: 'POST', body: pParams });
                const pData = await pRes.json();

                if (pData.error) {
                  publishErrors.push(`Instagram publish error: ${pData.error.message}`);
                  results.instagram = { success: false, error: pData.error.message };
                } else {
                  anySuccess = true;
                  results.instagram = {
                    success: true,
                    mediaId: pData.id
                  };
                }
              }
            }
          } catch (err) {
            publishErrors.push(`Instagram network error: ${err.message}`);
            results.instagram = { success: false, error: err.message };
          }
        }
      }
    }

    // Update campaign state based on genuine Meta response
    if (anySuccess) {
      campaign.status = 'published';
      campaign.publishedAt = new Date().toISOString();
      campaign.metaPublishResult = results;
      await persistCampaign(campaign);

      return res.json({
        success: true,
        message: 'Campaign published successfully via Meta Graph API!',
        results
      });
    } else {
      campaign.metaPublishResult = results;
      await persistCampaign(campaign);

      return res.status(400).json({
        success: false,
        error: `Publishing failed: ${publishErrors.join(' | ')}`,
        results
      });
    }
  } finally {
    // Always release publishing lock
    activePublishingLocks.delete(campaignId);
  }
});

// Periodic background scheduler (checks every 60 seconds)
setInterval(() => {
  try {
    const campaigns = readJson(CAMPAIGNS_FILE) || [];
    const now = new Date();
    let hasChanges = false;

    campaigns.forEach(c => {
      if (c.status === 'scheduled' && c.scheduledFor) {
        const scheduledDate = new Date(c.scheduledFor);
        if (now >= scheduledDate && c.approval?.approved) {
          console.log(`[Scheduler] Campaign ${c.id} reached scheduled time ${c.scheduledFor}. Ready for execution.`);
        }
      }
    });

    if (hasChanges) {
      writeJsonAtomic(CAMPAIGNS_FILE, campaigns);
    }
  } catch (err) {
    console.error('Scheduler interval error:', err);
  }
}, 60000);

// ----------------- SECURE /admin ROUTE & WORKSPACE PROTECTION -----------------
function serveAdminRoute(req, res) {
  const isProd = process.env.NODE_ENV === 'production';
  const session = getActiveSession(req);
  if (session && session.isAdmin && isAuthorizedAdminEmail(session.email)) {
    // Authenticated administrator: serve full marketing workspace
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    const adminPath = isProd && fs.existsSync(path.join(__dirname, 'dist', 'admin.html'))
      ? path.join(__dirname, 'dist', 'admin.html')
      : path.join(__dirname, 'admin.html');
    return res.sendFile(adminPath);
  }

  // Unauthenticated visitor: serve dedicated authentication page
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  const loginPath = isProd && fs.existsSync(path.join(__dirname, 'dist', 'admin-login.html'))
    ? path.join(__dirname, 'dist', 'admin-login.html')
    : path.join(__dirname, 'admin-login.html');
  return res.sendFile(loginPath);
}

app.get(['/admin', '/admin/'], serveAdminRoute);

// Protect direct access to admin.html as well (prevents bypassing /admin)
app.get('/admin.html', (req, res) => {
  const isProd = process.env.NODE_ENV === 'production';
  const session = getActiveSession(req);
  if (session && session.isAdmin && isAuthorizedAdminEmail(session.email)) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    const adminPath = isProd && fs.existsSync(path.join(__dirname, 'dist', 'admin.html'))
      ? path.join(__dirname, 'dist', 'admin.html')
      : path.join(__dirname, 'admin.html');
    return res.sendFile(adminPath);
  }
  return res.redirect('/admin');
});

// ----------------- VITE INTEGRATION -----------------
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  // Verify and sync persistent cloud storage on startup
  try {
    const initialCampaigns = await getStoredCampaigns();
    console.log(`[Storage] Verified persistent cloud storage: ${initialCampaigns.length} campaigns online.`);
  } catch (err) {
    console.warn('[Storage] Startup storage sync notice:', err.message);
  }

  if (!isProd) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port: PORT,
        allowedHosts: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : {}
      },
      appType: 'spa'
    });

    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Little Big Help Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
