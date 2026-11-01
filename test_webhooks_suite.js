import crypto from 'node:crypto';
import http from 'node:http';

const BASE = 'http://localhost:3000';
const VERIFY_TOKEN = 'test_verify_token_lbh_2026';
const APP_SECRET = 'meta_app_secret_test_key_12345';

// Set environment variables in the running Node environment for verification
process.env.META_WEBHOOK_VERIFY_TOKEN = VERIFY_TOKEN;
process.env.META_APP_SECRET = APP_SECRET;

async function run() {
  console.log('--- STARTING COMPREHENSIVE INSTAGRAM WEBHOOK TEST SUITE ---');
  let passCount = 0;
  let failCount = 0;

  async function test(name, fn) {
    try {
      const msg = await fn();
      console.log(`[PASS] ${name}: ${msg}`);
      passCount++;
    } catch (err) {
      console.error(`[FAIL] ${name}: ${err.message}`);
      failCount++;
    }
  }

  // 1. Webhook Status Check
  await test('1. Webhook Status Check (GET /webhooks/instagram/status)', async () => {
    const res = await fetch(`${BASE}/webhooks/instagram/status`);
    const data = await res.json();
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (data.endpoint !== '/webhooks/instagram') throw new Error(`Unexpected endpoint: ${data.endpoint}`);
    return `Status: ${data.status} | Endpoint: ${data.endpoint}`;
  });

  // 2. Missing GET parameters
  await test('2. Missing GET verification parameters', async () => {
    const res = await fetch(`${BASE}/webhooks/instagram`);
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden, got ${res.status}`);
    return `Correctly blocked with HTTP ${res.status}`;
  });

  // 3. Invalid GET verification token
  await test('3. Invalid GET verification token', async () => {
    const params = new URLSearchParams({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'wrong_token',
      'hub.challenge': 'challenge_123456'
    });
    const res = await fetch(`${BASE}/webhooks/instagram?${params}`);
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden, got ${res.status}`);
    return `Correctly rejected invalid token with HTTP ${res.status}`;
  });

  // 4. Invalid GET mode
  await test('4. Invalid GET mode (not subscribe)', async () => {
    const params = new URLSearchParams({
      'hub.mode': 'unsubscribe',
      'hub.verify_token': VERIFY_TOKEN,
      'hub.challenge': 'challenge_123456'
    });
    const res = await fetch(`${BASE}/webhooks/instagram?${params}`);
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden, got ${res.status}`);
    return `Correctly rejected invalid mode with HTTP ${res.status}`;
  });

  // 5. Valid GET verification challenge
  await test('5. Valid GET verification challenge', async () => {
    const challengeStr = '1158201444_instagram_challenge_test';
    const params = new URLSearchParams({
      'hub.mode': 'subscribe',
      'hub.verify_token': VERIFY_TOKEN,
      'hub.challenge': challengeStr
    });
    const res = await fetch(`${BASE}/webhooks/instagram?${params}`);
    const body = await res.text();
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (body !== challengeStr) throw new Error(`Expected challenge string "${challengeStr}", got "${body}"`);
    return `Successfully verified challenge: "${body}"`;
  });

  // 6. POST without X-Hub-Signature-256 header
  await test('6. Missing POST signature header', async () => {
    const res = await fetch(`${BASE}/webhooks/instagram`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ object: 'instagram', entry: [] })
    });
    if (res.status !== 401) throw new Error(`Expected 401 Unauthorized, got ${res.status}`);
    const data = await res.json();
    return `Correctly rejected with HTTP 401: ${data.error}`;
  });

  // 7. POST with invalid X-Hub-Signature-256
  await test('7. Invalid POST signature header', async () => {
    const payload = JSON.stringify({ object: 'instagram', entry: [] });
    const res = await fetch(`${BASE}/webhooks/instagram`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': 'sha256=0000000000000000000000000000000000000000000000000000000000000000'
      },
      body: payload
    });
    if (res.status !== 401) throw new Error(`Expected 401 Unauthorized, got ${res.status}`);
    const data = await res.json();
    return `Correctly rejected with HTTP 401: ${data.error}`;
  });

  // 8. POST with valid HMAC SHA-256 signature
  await test('8. Valid POST signature and valid payload', async () => {
    const payloadObj = {
      object: 'instagram',
      entry: [
        {
          id: '17841400000000000',
          time: Math.floor(Date.now() / 1000),
          changes: [
            {
              field: 'comments',
              value: {
                id: 'comment_987654321',
                text: 'Testing Instagram webhook'
              }
            }
          ]
        }
      ]
    };
    const payloadStr = JSON.stringify(payloadObj);
    const signature = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(payloadStr).digest('hex');

    const res = await fetch(`${BASE}/webhooks/instagram`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': signature
      },
      body: payloadStr
    });

    if (res.status !== 200) {
      const errText = await res.text();
      throw new Error(`Expected 200 OK, got ${res.status}: ${errText}`);
    }
    const data = await res.json();
    if (!data.success) throw new Error('Expected data.success: true');
    return `HTTP 200 OK received! Processed ${data.processedEvents} event(s)`;
  });

  // 9. POST duplicate event handling
  await test('9. Duplicate event notification deduplication', async () => {
    const fixedTime = 1790000000;
    const payloadObj = {
      object: 'instagram',
      entry: [
        {
          id: '17841400000000000',
          time: fixedTime,
          changes: [
            {
              field: 'comments',
              value: {
                id: 'duplicate_comment_id_111',
                text: 'Testing deduplication'
              }
            }
          ]
        }
      ]
    };
    const payloadStr = JSON.stringify(payloadObj);
    const signature = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(payloadStr).digest('hex');

    // First request
    await fetch(`${BASE}/webhooks/instagram`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': signature
      },
      body: payloadStr
    });

    // Duplicate request
    const res2 = await fetch(`${BASE}/webhooks/instagram`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': signature
      },
      body: payloadStr
    });

    const data2 = await res2.json();
    if (res2.status !== 200) throw new Error(`Expected 200, got ${res2.status}`);
    if (data2.duplicateEvents < 1) throw new Error('Expected duplicateEvents count >= 1');
    return `Correctly detected duplicate: duplicateEvents=${data2.duplicateEvents}`;
  });

  // 10. Malformed payload with valid signature
  await test('10. Malformed payload handling (safe 400 rejection)', async () => {
    const rawBadJson = '{"object": "instagram", entry: [bad json}}';
    const signature = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(rawBadJson).digest('hex');

    const res = await fetch(`${BASE}/webhooks/instagram`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': signature
      },
      body: rawBadJson
    });

    if (res.status !== 400) throw new Error(`Expected 400 Bad Request, got ${res.status}`);
    const data = await res.json();
    return `Correctly rejected malformed payload with HTTP 400: ${data.error}`;
  });

  // 11. Existing admin login & campaigns API sanity check
  await test('11. Existing Admin Login & Protected API Preservation', async () => {
    // 1. Login with admin credentials
    const adminEmail = process.env.ADMIN_EMAIL || 'orghosimsung@gmail.com';
    const adminPasscode = process.env.ADMIN_PASSCODE || 'LBH-Sylhet!7264#Mango';
    const loginRes = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, passcode: adminPasscode })
    });
    if (loginRes.status !== 200) throw new Error(`Admin login failed: ${loginRes.status}`);
    const loginData = await loginRes.json();
    const token = loginData.token;
    const cookie = loginRes.headers.get('set-cookie');

    // 2. Fetch campaigns
    const campRes = await fetch(`${BASE}/api/campaigns`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Cookie': cookie || ''
      }
    });
    if (campRes.status !== 200) throw new Error(`Fetch campaigns failed: ${campRes.status}`);
    const campData = await campRes.json();
    if (!Array.isArray(campData.campaigns) || campData.campaigns.length < 2) {
      throw new Error(`Expected at least 2 preserved campaigns, found ${campData.campaigns?.length}`);
    }

    // 3. Check Meta settings endpoint
    const metaRes = await fetch(`${BASE}/api/meta/settings`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Cookie': cookie || ''
      }
    });
    if (metaRes.status !== 200) throw new Error(`Fetch meta settings failed: ${metaRes.status}`);
    const metaData = await metaRes.json();
    if (!metaData.settings.webhookConfig) throw new Error('webhookConfig missing in meta settings');

    return `Login OK, preserved ${campData.campaigns.length} campaigns, webhookConfig active`;
  });

  console.log(`\n=========================================`);
  console.log(`RESULTS: ${passCount} Passed, ${failCount} Failed`);
  console.log(`=========================================`);

  if (failCount > 0) process.exit(1);
  process.exit(0);
}

run().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
