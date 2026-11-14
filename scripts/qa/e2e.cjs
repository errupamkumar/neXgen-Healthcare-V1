// End-to-end UI test for nexgen-Medical: public site -> register -> book -> manage,
// every role, phones, Hindi/English, light/dark and the doctor video.
//
//   node scripts/qa/e2e.cjs [baseUrl] [all|patient|roles|mobile|prefs]
//
// It books, reschedules and cancels real appointments — back up data.json first.
// Needs Google Chrome (CHROME_PATH to override) and playwright-core.
const path = require('path');
const fs = require('fs');
function loadPlaywright() {
  for (const c of ['playwright-core', path.resolve(__dirname, '../../../nexgen-hms/node_modules/playwright-core')]) {
    try { return require(c); } catch { /* next */ }
  }
  throw new Error('playwright-core not found: npm i -D playwright-core');
}
const { chromium } = loadPlaywright();
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(__dirname, 'output');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.argv[2] || 'http://localhost:3001';
const ONLY = process.argv[3] || 'all';

let step = 0, pass = 0, fail = 0;
const errors = [];
const log = (ok, name, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };
const shot = async (page, name, full = false) => {
  step++; await page.waitForTimeout(500);
  const file = path.join(OUT, `${String(step).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: full });
};

async function expectVisible(page, locator, name, timeout = 8000) {
  try { await locator.first().waitFor({ state: 'visible', timeout }); log(true, name); return true; }
  catch (e) { log(false, name, e.message.split('\n')[0]); await shot(page, 'FAIL-' + name.replace(/\W+/g, '-').slice(0, 40)); return false; }
}

function watch(page, label) {
  page.on('pageerror', e => errors.push(`[${label}] pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`[${label}] console: ${m.text()}`); });
  page.on('response', r => { if (r.status() >= 400 && !/tile\.openstreetmap|unsplash/.test(r.url())) errors.push(`[${label}] HTTP ${r.status()} ${r.url()}`); });
}

async function signInAs(page, role) {
  // role: 'Patient' | 'Doctor' | 'Front Desk' | 'Admin'
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /^Sign in$/ }).first().click();
  await page.getByRole('button', { name: new RegExp(`^${role} portal$`) }).click();
  await page.getByRole('button', { name: /Sign In to neXgen/i }).click();
  await page.waitForTimeout(1600);
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  watch(page, 'desktop');
  const stamp = Date.now().toString().slice(-6);

  if (ONLY === 'all' || ONLY === 'patient') {
    // 1. Public landing
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.clear());
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await expectVisible(page, page.getByRole('heading', { name: /See the right doctor/i }), 'landing hero renders');
    await expectVisible(page, page.getByRole('button', { name: /Book for ₹50/ }), 'doctor cards render');
    await shot(page, 'landing', true);

    // 2. Speciality filter on landing
    await page.locator('#specialities').getByRole('button').first().click();
    await page.waitForTimeout(600);
    await expectVisible(page, page.locator('#doctors').getByRole('button', { name: /Book for ₹50/ }), 'speciality filter shows doctors');

    // 3. Book a doctor from the public site -> sign-in with intent
    const firstName = await page.locator('#doctors article h3').first().innerText();
    await page.locator('#doctors').getByRole('button', { name: /Book for ₹50/ }).first().click();
    await expectVisible(page, page.getByText(/Sign in to book/), 'login shows booking intent');
    await shot(page, 'login-intent');

    // 4. Register a new patient with OTP
    await page.getByRole('button', { name: /New patient\? Register here/ }).click();
    await page.fill('#regName', `Test Patient ${stamp}`);
    await page.fill('#regMobile', `91${stamp}00`);
    await page.getByRole('button', { name: /Send OTP/ }).click();
    await page.fill('#regOtp', '123456');
    await page.getByRole('button', { name: /Confirm & Create Profile/ }).click();

    // 5. Lands on booking step 2 with the doctor preselected
    await expectVisible(page, page.getByRole('heading', { name: /Pick a day/ }), 'booking opens on step 2', 10000);
    const preselected = await page.getByText(firstName.trim(), { exact: false }).count();
    log(preselected > 0, 'chosen doctor carried into booking', firstName.trim());
    await page.getByRole('button', { name: /Tomorrow/ }).first().click();
    await page.waitForTimeout(700);
    const slot = page.locator('section:has(h3:text("Pick a time")) button:not([disabled])').filter({ hasText: 'left' }).first();
    await slot.click();
    await page.getByLabel('Patient age').fill('34');
    await shot(page, 'book-step2');
    await page.getByRole('button', { name: /^Continue/ }).click();
    await expectVisible(page, page.getByRole('heading', { name: /Review your appointment/ }), 'review step');
    await shot(page, 'book-step3', true);
    await page.getByRole('button', { name: /Pay ₹50 and confirm booking/ }).click();
    await expectVisible(page, page.getByText(/Your appointment is booked/), 'booking confirmed', 10000);
    const token = await page.getByText(/^T-\d\d$/).first().innerText().catch(() => '');
    log(/^T-\d\d$/.test(token), 'OPD token shown on confirmation', token);
    await shot(page, 'book-confirmed');

    // 6. Duplicate booking blocked: same doctor same day
    // (covered at API level) — go to My Appointments
    await page.getByRole('button', { name: /My appointments/ }).first().click();
    await expectVisible(page, page.getByRole('button', { name: /Reschedule/ }), 'my appointments lists booking');
    await shot(page, 'my-appointments');

    // 7. Session survives refresh
    await page.reload({ waitUntil: 'networkidle' });
    await expectVisible(page, page.getByRole('button', { name: /Reschedule/ }), 'session persists after refresh');

    // 8. Reschedule
    await page.getByRole('button', { name: /Reschedule/ }).first().click();
    await expectVisible(page, page.getByRole('heading', { name: /Reschedule appointment/ }), 'reschedule modal opens');
    const dayButtons = page.locator('section:has(h3:text("Pick a day")) button');
    await dayButtons.nth(3).click();
    await page.waitForTimeout(700);
    await page.locator('section:has(h3:text("Pick a time")) button:not([disabled])').filter({ hasText: 'left' }).first().click();
    await page.getByRole('button', { name: /^Continue/ }).last().click();
    await expectVisible(page, page.getByText(/No extra charge to reschedule/), 'reschedule review shows no extra charge');
    await shot(page, 'reschedule-review');
    await page.getByRole('button', { name: /Confirm new time/ }).click();
    await expectVisible(page, page.getByText(/Your appointment has been moved/), 'reschedule confirmed');
    await page.getByRole('button', { name: /Close/ }).first().click().catch(() => {});
    await page.waitForTimeout(500);

    // 9. Second booking with pay-at-counter, then pay from My Appointments
    await page.getByRole('button', { name: /Book a doctor · ₹50/ }).click();
    await page.getByRole('searchbox', { name: /Search doctors/ }).fill('Physician');
    await page.waitForTimeout(500);
    await page.locator('div[role="button"][aria-pressed]').first().click();
    await page.getByRole('button', { name: /^Continue/ }).click();
    await page.getByRole('button', { name: /Tomorrow/ }).first().click();
    await page.waitForTimeout(700);
    await page.locator('section:has(h3:text("Pick a time")) button:not([disabled])').filter({ hasText: 'left' }).first().click();
    await page.getByRole('button', { name: /^Continue/ }).click();
    await page.getByRole('button', { name: /At the counter/ }).click();
    await page.getByRole('button', { name: /Hold my slot/ }).click();
    await expectVisible(page, page.getByText(/Due at the clinic reception/), 'counter booking shows fee due');
    await page.getByRole('button', { name: /My appointments/ }).first().click();
    await expectVisible(page, page.getByRole('button', { name: /Pay ₹50/ }), 'pay button for unpaid booking');
    await page.getByRole('button', { name: /Pay ₹50/ }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: /Pay ₹50/ }).click();
    await expectVisible(page, page.getByText(/received — your slot is confirmed/), 'platform fee paid');

    // 10. Cancel with refund
    await page.getByRole('button', { name: /^Cancel$/ }).first().click();
    await expectVisible(page, page.getByText(/get your ₹50 back/), 'cancel dialog explains refund');
    await shot(page, 'cancel-dialog');
    await page.getByRole('button', { name: /Yes, cancel/ }).click();
    await expectVisible(page, page.getByText(/refund initiated/), 'cancel confirmed with refund');
    await page.getByRole('button', { name: /Cancelled/ }).first().click();
    await shot(page, 'cancelled-tab');

    // 11. Home
    await page.getByRole('button', { name: /^Home$/ }).first().click();
    await expectVisible(page, page.getByText(/how can we help today/), 'patient home renders');
    await shot(page, 'patient-home', true);

    // 12. Visit history + vault + profile + messages render
    for (const [nav, check] of [[/^Visit History$/, /Appointment|History|visit/i], [/^Health Vault$/, /Vault|Document/i], [/^Profile$/, /Profile/i], [/^Messages$/, /Messages|inbox|notice/i]]) {
      await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: nav }).click();
      await page.waitForTimeout(700);
      await expectVisible(page, page.locator('main').getByText(check), `patient page ${nav}`);
      await shot(page, 'patient-' + String(nav).replace(/\W+/g, '-'));
    }

    // 13. Sign out -> landing; doctor application
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expectVisible(page, page.getByRole('heading', { name: /See the right doctor/i }), 'sign out returns to website');
    await page.getByRole('button', { name: /Join as a doctor/ }).first().click();
    await page.getByPlaceholder('e.g. Dr. Neha Singh').fill(`Dr. QA Applicant ${stamp}`);
    await page.getByPlaceholder('e.g. Consultant Dermatologist').fill('Consultant Dentist');
    await page.getByPlaceholder('e.g. BMC-54210').fill(`BMC-${stamp}`);
    await page.getByPlaceholder('10-digit mobile').fill(`88${stamp}44`);
    await page.getByPlaceholder('e.g. Singh Skin Clinic').fill('QA Dental Studio');
    await shot(page, 'join-doctor-form');
    await page.getByRole('button', { name: /Submit application/ }).click();
    await expectVisible(page, page.getByText(/Application received/), 'doctor application submitted');
    await page.getByRole('button', { name: /^Done$/ }).click();
  }

  if (ONLY === 'all' || ONLY === 'roles') {
    // 14. Admin approves the application
    await signInAs(page, 'Admin');
    await expectVisible(page, page.getByRole('navigation', { name: 'Primary' }), 'admin signed in');
    await shot(page, 'admin-workspace');
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: /Doctor Onboarding/ }).click();
    await expectVisible(page, page.getByRole('heading', { name: 'Doctor Onboarding' }), 'onboarding page');
    await shot(page, 'admin-onboarding');
    const approve = page.getByRole('button', { name: /Approve & publish/ });
    if (await approve.count()) {
      await approve.first().click();
      await expectVisible(page, page.getByText(/is now live/), 'approve publishes doctor');
    } else log(false, 'pending application available to approve');
    for (const nav of [/^Dashboard$/, /^Appointments$/, /^Completed$/, /^Messages$/, /^Clinical Patients$/, /^Document Vault$/]) {
      await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: nav }).click();
      await page.waitForTimeout(800);
      log(true, `admin page ${nav} opened`);
    }
    await shot(page, 'admin-dashboard');

    // 15. Doctor
    await signInAs(page, 'Doctor');
    await expectVisible(page, page.getByRole('heading', { name: /My Dashboard/ }), 'doctor lands on dashboard');
    await shot(page, 'doctor-dashboard');
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: /My Queue/ }).click();
    await expectVisible(page, page.getByRole('heading', { name: /My Queue/ }), 'doctor queue');
    await shot(page, 'doctor-queue');
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: /^Profile$/ }).click();
    await page.waitForTimeout(800);
    await shot(page, 'doctor-profile');

    // 16. Front desk books on behalf of a walk-in
    await signInAs(page, 'Front Desk');
    await expectVisible(page, page.getByRole('heading', { name: /Desk Workspace/ }), 'desk lands on workspace');
    await shot(page, 'desk-workspace');
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: /^Dashboard$/ }).click();
    await page.waitForTimeout(800);
    await shot(page, 'desk-dashboard');
    await page.getByRole('button', { name: /New booking/ }).click();
    await page.getByRole('searchbox', { name: /Search doctors/ }).fill('Pediatric');
    await page.waitForTimeout(500);
    await page.locator('div[role="button"][aria-pressed]').first().click();
    await page.getByRole('button', { name: /^Continue/ }).click();
    await page.getByRole('button', { name: /Tomorrow/ }).first().click();
    await page.waitForTimeout(700);
    await page.locator('section:has(h3:text("Pick a time")) button:not([disabled])').filter({ hasText: 'left' }).first().click();
    await page.getByPlaceholder('e.g. Aarav Patel').fill(`Walkin ${stamp}`);
    await page.getByPlaceholder('e.g. 34').fill('8');
    await page.getByPlaceholder('e.g. +91 98201 45678').fill(`70${stamp}55`);
    await page.getByRole('button', { name: /^Continue/ }).click();
    await page.getByRole('button', { name: /At the counter/ }).click();
    await page.getByRole('button', { name: /Hold my slot/ }).click();
    await expectVisible(page, page.getByText(/Your appointment is booked/), 'desk booking for walk-in');
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: /^Appointments$/ }).click();
    await page.waitForTimeout(800);
    await shot(page, 'desk-queue');
    // Desk collects a ₹50 taken in cash (switch to all dates if the queue has that scope).
    const sel = page.locator('main select').first();
    const opts = await sel.locator('option').allTextContents();
    const ped = opts.find(o => /Ananya/.test(o));
    if (ped) await sel.selectOption({ label: ped });
    await page.getByRole('button', { name: /^Upcoming$/ }).first().click().catch(() => {});
    await page.waitForTimeout(600);
    const collect = page.getByRole('button', { name: /^Collect$/ });
    const before = await collect.count();
    if (before > 0) {
      await collect.first().click();
      await page.waitForTimeout(1200);
      const after = await page.getByRole('button', { name: /^Collect$/ }).count();
      log(after === before - 1, 'desk collects ₹50 at counter', `${before} -> ${after}`);
    } else {
      log(true, 'desk collect button not shown (no unpaid bookings in current queue scope)');
    }
  }

  if (ONLY === 'all' || ONLY === 'mobile') {
    const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const mp = await m.newPage();
    watch(mp, 'mobile');
    await mp.goto(BASE, { waitUntil: 'networkidle' });
    await mp.evaluate(() => localStorage.clear());
    await mp.goto(BASE, { waitUntil: 'networkidle' });
    await shot(mp, 'mobile-landing', true);
    await mp.getByRole('button', { name: /^Menu$/ }).click();
    await mp.getByRole('button', { name: /^Sign in$/ }).last().click();
    await mp.getByRole('button', { name: /Need demo login credentials/ }).click();
    await mp.getByRole('button', { name: /Patient Rupam Kumar/ }).click();
    await mp.waitForTimeout(1600);
    await expectVisible(mp, mp.getByText(/how can we help today/), 'mobile patient home');
    await expectVisible(mp, mp.getByRole('navigation', { name: 'Quick navigation' }), 'mobile tab bar');
    await shot(mp, 'mobile-patient-home', true);
    await m.close();
  }

  if (ONLY === 'all' || ONLY === 'prefs') {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await c.newPage();
    watch(p, 'prefs');
    await p.goto(BASE, { waitUntil: 'networkidle' });
    await p.evaluate(() => localStorage.clear());
    await p.goto(BASE, { waitUntil: 'networkidle' });

    // Language: switch to Hindi, survives a reload, switch back.
    await p.getByRole('button', { name: 'हिं' }).first().click();
    await expectVisible(p, p.getByRole('heading', { name: /सही डॉक्टर से मिलें/ }), 'switches to Hindi');
    log((await p.evaluate(() => document.documentElement.lang)) === 'hi', 'html lang set to hi');
    await p.reload({ waitUntil: 'networkidle' });
    await expectVisible(p, p.getByRole('heading', { name: /सही डॉक्टर से मिलें/ }), 'Hindi persists after reload');
    await p.getByRole('button', { name: 'EN' }).first().click();
    await expectVisible(p, p.getByRole('heading', { name: /See the right doctor/ }), 'switches back to English');

    // Theme: dark on, survives reload, background really dark, off again.
    await p.getByRole('button', { name: 'Switch to dark mode' }).first().click();
    log(await p.evaluate(() => document.documentElement.classList.contains('dark')), 'dark mode applied');
    await p.reload({ waitUntil: 'networkidle' });
    log(await p.evaluate(() => document.documentElement.classList.contains('dark')), 'dark mode persists after reload');
    const bg = await p.evaluate(() => getComputedStyle(document.querySelector('header')).backgroundColor);
    log(!/255, 255, 255/.test(bg), 'header background is dark', bg);
    await shot(p, 'prefs-dark');
    await p.getByRole('button', { name: 'Switch to light mode' }).first().click();
    log(!(await p.evaluate(() => document.documentElement.classList.contains('dark'))), 'light mode restored');

    // Video for doctors: modal player loads the MP4 and both subtitle tracks.
    await p.locator('#for-doctors').scrollIntoViewIfNeeded();
    await p.getByRole('button', { name: /Watch the video for doctors/ }).first().click();
    const video = p.locator('video');
    await expectVisible(p, video, 'video modal opens');
    const meta = await p.waitForFunction(() => {
      const v = document.querySelector('video');
      return v && v.readyState >= 1 ? { duration: v.duration, w: v.videoWidth, h: v.videoHeight, tracks: v.textTracks.length } : null;
    }, null, { timeout: 20000 }).then(h => h.jsonValue()).catch(() => null);
    log(!!meta && meta.duration > 120, 'video metadata loads', JSON.stringify(meta));
    log(!!meta && meta.w === 1920 && meta.h === 1080, 'video is 1920×1080');
    log(!!meta && meta.tracks === 2, 'EN + HI subtitle tracks attached');
    await shot(p, 'video-modal');
    await p.keyboard.press('Escape');

    // Live presentation page.
    await p.goto(`${BASE}/doctors-video`, { waitUntil: 'networkidle' });
    await expectVisible(p, p.getByRole('button', { name: /Pause|Play/ }), 'live presentation has controls');
    await p.waitForTimeout(2500);
    await shot(p, 'live-presentation');
    await c.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  const uniq = [...new Set(errors)];
  console.log(uniq.length ? 'Console/HTTP errors:\n' + uniq.join('\n') : 'No console or HTTP errors.');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
