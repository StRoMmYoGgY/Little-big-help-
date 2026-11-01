import dotenv from 'dotenv';
dotenv.config();

const BASE = 'http://localhost:3000';
let passCount = 0;
let failCount = 0;

async function test(name, fn) {
  try {
    const msg = await fn();
    console.log(`[PASS] ${name}: ${msg || 'OK'}`);
    passCount++;
  } catch (err) {
    console.error(`[FAIL] ${name}: ${err.message}`);
    failCount++;
  }
}

async function run() {
  console.log('\n--- EXECUTING COMPLETE SYSTEM VERIFICATION SUITE ---\n');

  const adminEmail = process.env.ADMIN_EMAIL || 'orghosimsung@gmail.com';
  const adminPasscode = process.env.ADMIN_PASSCODE || 'LBH-Sylhet!7264#Mango';
  let sessionToken = null;
  let sessionCookie = null;
  let createdCampaignId = null;

  // 1. Backend API Health Check
  await test('1. Backend API Health Check (GET /api/health)', async () => {
    const res = await fetch(`${BASE}/api/health`);
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (data.status !== 'ok') throw new Error(`Health status not ok: ${data.status}`);
    if (!data.firestore || !data.firestore.connected) throw new Error('Firestore not marked connected');
    return `Status: OK | Firestore DB: ${data.firestore.databaseId} | Mode: ${data.storage.mode} | Campaigns: ${data.storage.campaignsOnline}`;
  });

  // 2. Admin Authentication & Login
  await test('2. Admin Authentication & Login (POST /api/auth/login)', async () => {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, passcode: adminPasscode })
    });
    if (res.status !== 200) throw new Error(`Login failed with HTTP ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error('data.success is false');
    if (!data.token) throw new Error('Session token not returned');
    sessionToken = data.token;
    sessionCookie = res.headers.get('set-cookie');
    return `Logged in successfully as ${data.user.email} (token length: ${sessionToken.length})`;
  });

  // 3. Dashboard Session Verification (GET /api/auth/me)
  await test('3. Dashboard Session Verification (GET /api/auth/me)', async () => {
    const res = await fetch(`${BASE}/api/auth/me`, {
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'Cookie': sessionCookie || ''
      }
    });
    if (res.status !== 200) throw new Error(`Auth verification failed: ${res.status}`);
    const data = await res.json();
    if (!data.authenticated || data.user.email !== adminEmail.toLowerCase()) {
      throw new Error(`Unexpected user in session: ${JSON.stringify(data)}`);
    }
    return `Authenticated: true | User: ${data.user.name} (${data.user.role})`;
  });

  // 4. Session Persistence After Simulated Refresh
  await test('4. Session Persistence After Refresh (Simulated Browser Reload)', async () => {
    // A page reload makes a fresh GET /api/auth/me with either cookie or Bearer header
    const cookieOnlyRes = await fetch(`${BASE}/api/auth/me`, {
      headers: { 'Cookie': sessionCookie || '' }
    });
    if (cookieOnlyRes.status !== 200) throw new Error(`Cookie auth reload failed: ${cookieOnlyRes.status}`);

    const bearerOnlyRes = await fetch(`${BASE}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${sessionToken}` }
    });
    if (bearerOnlyRes.status !== 200) throw new Error(`Bearer auth reload failed: ${bearerOnlyRes.status}`);

    return 'Session seamlessly retained via both httpOnly cookie and Bearer token fallback';
  });

  // 5. Campaign Creation & Saving
  await test('5. Campaign Creation & Saving (POST /api/campaigns)', async () => {
    const newCamp = {
      title: 'E2E Test: Fast Reliable Local Assistance',
      serviceCategory: 'Home Repairs & Handyman',
      targetAudience: 'Homeowners in Sylhet',
      goal: 'Brand Awareness',
      aspectRatio: '1:1',
      headline: 'Need Dependable Help at Home?',
      hook: 'Verified local technicians ready to assist with any household task.',
      bodyCopy: 'From plumbing and electrical maintenance to emergency repairs, Little Big Help brings verified local hands right to your doorstep.',
      callToAction: 'Chat with Little Big Help on WhatsApp at +880 1865-383565.',
      hashtags: ['#SylhetRepairs', '#LittleBigHelp', '#SylhetCity'],
      platforms: ['facebook', 'instagram']
    };

    const res = await fetch(`${BASE}/api/campaigns`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionToken}`,
        'Cookie': sessionCookie || ''
      },
      body: JSON.stringify(newCamp)
    });
    if (res.status !== 200 && res.status !== 201) throw new Error(`Creation failed: ${res.status}`);
    const data = await res.json();
    if (!data.campaign || !data.campaign.id) throw new Error('Created campaign missing ID');
    createdCampaignId = data.campaign.id;
    return `Created campaign ID: ${createdCampaignId} (status: ${data.campaign.status})`;
  });

  // 6. Firestore Persistence & Data Loading
  await test('6. Firestore Persistence & Data Loading (GET /api/campaigns)', async () => {
    const res = await fetch(`${BASE}/api/campaigns`, {
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'Cookie': sessionCookie || ''
      }
    });
    if (res.status !== 200) throw new Error(`Failed to load campaigns: ${res.status}`);
    const data = await res.json();
    const found = data.campaigns.find(c => c.id === createdCampaignId);
    if (!found) throw new Error(`Created campaign ${createdCampaignId} not found in campaigns list`);
    return `Loaded ${data.campaigns.length} campaigns; persistent record confirmed (${found.title})`;
  });

  // 7. Campaign Approval Gate Check
  await test('7. Campaign Approval Workflow (POST /api/campaigns/:id/approve)', async () => {
    const res = await fetch(`${BASE}/api/campaigns/${createdCampaignId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionToken}`,
        'Cookie': sessionCookie || ''
      }
    });
    if (res.status !== 200) throw new Error(`Approval failed: ${res.status}`);
    const data = await res.json();
    if (!data.campaign.approval || !data.campaign.approval.approved) throw new Error('Campaign not approved');
    return `Campaign approved: ${data.campaign.approval.approved} by ${data.campaign.approval.approvedBy}`;
  });

  // 8. Campaign Cleanup / Deletion
  await test('8. Campaign Cleanup & Deletion (DELETE /api/campaigns/:id)', async () => {
    const res = await fetch(`${BASE}/api/campaigns/${createdCampaignId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'Cookie': sessionCookie || ''
      }
    });
    if (res.status !== 200) throw new Error(`Delete failed: ${res.status}`);
    return `Deleted temporary test campaign ${createdCampaignId}`;
  });

  // 9. Frontend and Backend Connectivity
  await test('9. Frontend & Backend HTML / Asset Routes', async () => {
    // 1. Landing page
    const indexRes = await fetch(`${BASE}/`);
    if (indexRes.status !== 200) throw new Error(`Landing page failed: ${indexRes.status}`);

    // 2. Admin login page
    const loginPageRes = await fetch(`${BASE}/admin`);
    if (loginPageRes.status !== 200) throw new Error(`Admin route failed: ${loginPageRes.status}`);

    // 3. Instagram webhook endpoint status
    const whRes = await fetch(`${BASE}/webhooks/instagram/status`);
    if (whRes.status !== 200) throw new Error(`Webhook status failed: ${whRes.status}`);

    return 'Root landing page, /admin routing, and /webhooks/instagram/status all reachable (HTTP 200)';
  });

  // 10. Secure Logout
  await test('10. Secure Logout & Session Termination (POST /api/auth/logout)', async () => {
    const res = await fetch(`${BASE}/api/auth/logout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'Cookie': sessionCookie || ''
      }
    });
    if (res.status !== 200) throw new Error(`Logout failed: ${res.status}`);

    // Verify session revoked
    const verifyRes = await fetch(`${BASE}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${sessionToken}` }
    });
    if (verifyRes.status !== 401) throw new Error(`Expected 401 after logout, got ${verifyRes.status}`);

    return 'Logged out successfully; session token revoked from both memory and database';
  });

  console.log(`\n=========================================`);
  console.log(`TEST SUMMARY: ${passCount} Passed, ${failCount} Failed`);
  console.log(`=========================================\n`);

  if (failCount > 0) process.exit(1);
  process.exit(0);
}

run().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
