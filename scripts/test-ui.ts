/**
 * Browser end-to-end test against a running dev server (npm run dev:memory).
 * Uses the locally installed Chrome/Edge via playwright-core.
 * Usage: BASE_URL=http://localhost:5173 npm run test:ui
 */
import { chromium, type Page } from 'playwright-core';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const EMAIL = process.env.TEST_ADMIN_EMAIL ?? 'admin@local.test';
const PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'local-admin-123';
const SHOTS = '.screenshots';
mkdirSync(SHOTS, { recursive: true });

const executablePath = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => existsSync(p));

const browser = await chromium.launch({ executablePath, headless: true });
const errors: string[] = [];
let passed = 0;

async function newPage(width: number, height: number) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource.*(404|401)/.test(m.text())) errors.push(`[${page.url()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[${page.url()}] ${e.message}`));
  return page;
}

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log('  ✓', name);
  } catch (err) {
    console.error('  ✗', name);
    throw err;
  }
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `page scrolls horizontally by ${overflow}px at ${page.url()}`);
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
}

async function shot(page: Page, name: string, fullPage = true) {
  // Reveal-on-scroll sections: scroll through so screenshots show everything.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) {
      window.scrollTo({ top: y, behavior: 'instant' });
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage });
}

/** Puts the database back into a known state (no WhatsApp number, no leftover test products). */
async function resetState() {
  const headers = { 'content-type': 'application/json', origin: BASE };
  const login = await fetch(BASE + '/api/admin/login', { method: 'POST', headers, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });
  assert.equal(login.status, 200, 'reset: admin login failed');
  const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0];
  const auth = { ...headers, cookie };
  await fetch(BASE + '/api/admin/settings', { method: 'PUT', headers: auth, body: JSON.stringify({ whatsappNumber: '' }) });
  const list = await (await fetch(BASE + '/api/admin/products?q=E2E', { headers: auth })).json();
  for (const p of list.items) await fetch(BASE + `/api/admin/products/${p._id}`, { method: 'DELETE', headers: auth });
  await fetch(BASE + '/api/admin/logout', { method: 'POST', headers: auth });
}

try {
  await resetState();
  console.log('Storefront');
  const viewports = [
    { name: 'mobile', w: 390, h: 844 },
    { name: 'tablet', w: 820, h: 1180 },
    { name: 'desktop', w: 1440, h: 900 },
  ];
  for (const vp of viewports) {
    await test(`home renders products at ${vp.name} width without horizontal scroll`, async () => {
      const page = await newPage(vp.w, vp.h);
      await page.goto(BASE + '/');
      await settle(page);
      assert.ok((await page.locator('.pcard').count()) >= 4, 'expected product cards');
      assert.ok((await page.locator('.cat-card').count()) >= 3, 'expected category cards');
      await noHorizontalScroll(page);
      await shot(page, `home-${vp.name}`);
      await page.context().close();
    });
  }

  const page = await newPage(390, 844);

  await test('mobile menu opens and navigates to a category', async () => {
    await page.goto(BASE + '/');
    await page.click('button[aria-label="Open menu"]');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/menu-mobile.png` });
    await page.click('.drawer__link:has-text("Hoodies")');
    await page.waitForURL('**/shop/hoodies');
    await settle(page);
    const names = await page.locator('.pcard__name').allTextContents();
    assert.ok(names.length >= 1 && names.every((n) => /hoodie/i.test(n)), `hoodies only: ${names}`);
  });

  await test('search finds products by name', async () => {
    await page.goto(BASE + '/');
    await page.click('button[aria-label="Search"]');
    await page.fill('#site-search', 'jeans');
    await page.keyboard.press('Enter');
    await page.waitForURL('**/shop?q=jeans');
    await settle(page);
    const names = await page.locator('.pcard__name').allTextContents();
    assert.ok(names.length >= 1 && names.every((n) => /jeans/i.test(n)), `jeans only: ${names}`);
  });

  await test('filters (size, colour, stock) and sorting update results and URL', async () => {
    await page.goto(BASE + '/shop');
    await settle(page);
    const all = await page.locator('.pcard').count();
    await page.click('.shop__filter-btn');
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${SHOTS}/filters-mobile.png` });
    await page.click('.sheet .chip:has-text("32")');
    await page.waitForURL(/size=32/);
    await settle(page);
    const sized = await page.locator('.pcard').count();
    assert.ok(sized > 0 && sized < all, `size filter narrows (${sized} of ${all})`);
    await page.click('.sheet button:has-text("results")');
    await page.goto(BASE + '/shop?inStock=1');
    await settle(page);
    assert.equal(await page.locator('.badge--sold').count(), 0, 'no sold-out products when filtering in stock');
    await page.goto(BASE + '/shop');
    await settle(page);
    await page.selectOption('.shop__sort select', 'price-asc');
    await page.waitForURL(/sort=price-asc/);
    await settle(page);
    const prices = (await page.locator('.pcard .price__now').allTextContents()).map((t) => Number(t.replace(/\D/g, '')));
    assert.deepEqual(prices, [...prices].sort((a, b) => a - b), 'ascending prices');
    await noHorizontalScroll(page);
    await shot(page, 'shop-mobile');
  });

  let productPath = '';
  await test('product page: size selection; no WhatsApp when unconfigured', async () => {
    await page.goto(BASE + '/shop?q=spider%20back');
    await settle(page);
    await page.click('.pcard__name a');
    await page.waitForURL('**/product/**');
    productPath = new URL(page.url()).pathname;
    await settle(page);
    assert.match(await page.locator('h1').textContent() ?? '', /Spider Back Print Oversized Tee/);
    await page.click('.size:has-text("L") >> nth=0');
    assert.match((await page.locator('#size-picker legend').textContent()) ?? '', /L/);
    const disabledWa = page.locator('.pdp__cta button:has-text("WhatsApp ordering unavailable")');
    assert.ok(await disabledWa.isDisabled(), 'WhatsApp disabled when no number configured');
    await noHorizontalScroll(page);
    await shot(page, 'product-mobile');
  });

  await test('product URL works on direct load/refresh and unknown product shows 404 page', async () => {
    await page.goto(BASE + productPath);
    await settle(page);
    assert.match(await page.locator('h1').textContent() ?? '', /Spider Back/);
    await page.goto(BASE + '/product/does-not-exist');
    await settle(page);
    assert.match(await page.locator('h1').textContent() ?? '', /gone/i);
  });

  console.log('Admin');
  const admin = await newPage(1280, 860);

  await test('admin redirects to login and rejects a wrong password', async () => {
    await admin.goto(BASE + '/admin/products');
    await admin.waitForURL(/\/admin\/login/);
    await admin.fill('#email', EMAIL);
    await admin.fill('#password', 'wrong-password-123');
    await admin.click('button:has-text("Sign in")');
    await admin.waitForSelector('.form-alert');
    assert.match((await admin.locator('.form-alert').textContent()) ?? '', /incorrect/i);
  });

  await test('admin signs in and sees dashboard stats', async () => {
    await admin.fill('#password', PASSWORD);
    await admin.click('button:has-text("Sign in")');
    await admin.waitForURL(/\/admin\/products$/);
    await admin.goto(BASE + '/admin');
    await settle(admin);
    const total = Number(await admin.locator('.stat__value').first().textContent());
    assert.ok(total >= 11, `stats total ${total}`);
    await admin.screenshot({ path: `${SHOTS}/admin-dashboard.png`, fullPage: true });
  });

  await test('admin sets WhatsApp number in settings', async () => {
    await admin.goto(BASE + '/admin/settings');
    await settle(admin);
    await admin.fill('#wa', '98765 43210');
    await admin.click('button:has-text("Save settings")');
    await admin.waitForSelector('.toast--success');
    assert.equal(await admin.inputValue('#wa'), '+919876543210');
  });

  // A real photo-like test image for the upload pipeline.
  const testImage = `${SHOTS}/upload-test.jpg`;
  await sharp({ create: { width: 2400, height: 3000, channels: 3, background: '#2c4a7a' } })
    .composite([{ input: Buffer.from('<svg width="2400" height="3000"><rect x="600" y="700" width="1200" height="1500" fill="#e8421c"/></svg>') }])
    .jpeg({ quality: 92 })
    .toFile(testImage);

  await test('admin adds a product with a photo, sizes, colours and stock (review → publish)', async () => {
    await admin.goto(BASE + '/admin/products/new');
    await settle(admin);
    await admin.setInputFiles('input[type=file]', testImage);
    await admin.waitForSelector('.img-tile:not(.img-tile--upload)', { timeout: 30000 });
    await admin.fill('#name', 'E2E Test Overshirt');
    await admin.selectOption('#category', 'shirts');
    await admin.fill('#description', 'Created by the automated UI test.');
    await admin.fill('#price', '899');
    await admin.click('.chip--color:has-text("Navy")');
    await admin.click('.chip--color:has-text("Red")');
    await admin.fill('input[aria-label="Stock for size M in Navy"]', '5');
    await admin.fill('input[aria-label="Stock for size L in Red"]', '2');
    await admin.selectOption('label:has-text("Colour for photo 1") select', 'Red');
    await admin.click('button:has-text("Review & publish")');
    await admin.waitForSelector('dialog[open]');
    await admin.screenshot({ path: `${SHOTS}/admin-review.png` });
    await admin.click('dialog button:has-text("Publish to store")');
    await admin.waitForURL(/\/admin\/products$/);
    await admin.waitForSelector('.toast--success');
  });

  await test('new product appears on the storefront (new arrivals) with image, price and WhatsApp link', async () => {
    const shop = await newPage(390, 844);
    await shop.goto(BASE + '/shop/new-arrivals');
    await settle(shop);
    assert.match((await shop.locator('.pcard__name').first().textContent()) ?? '', /E2E Test Overshirt/);
    await shop.click('.pcard__name a:has-text("E2E Test Overshirt")');
    await settle(shop);
    assert.equal(await shop.locator('.pdp__info .price__now').textContent(), 'Sale price ₹899');
    assert.ok(await shop.locator('.gallery img').first().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0));
    // Navy has a single in-stock size, so it is preselected.
    assert.match((await shop.locator('#size-picker legend').textContent()) ?? '', /M/);
    // Switching to Red clears M (unavailable in Red); enquiring now prompts for a size.
    await shop.click('button.swatch[aria-label^="Red"]');
    assert.ok(await shop.locator('.size:has-text("M")').isDisabled(), 'M is out of stock in Red');
    await shop.click('.pdp__cta a.btn--whatsapp');
    await shop.waitForSelector('.opt__error');
    await shop.click('.size:has-text("L")');
    const href = (await shop.locator('.pdp__cta a.btn--whatsapp').getAttribute('href')) ?? '';
    assert.ok(href.startsWith('https://wa.me/919876543210?text='), href);
    const msg = decodeURIComponent(href.split('text=')[1]);
    assert.match(msg, /Product: E2E Test Overshirt/);
    assert.match(msg, /Price: ₹899/);
    assert.match(msg, /Size: L/);
    assert.match(msg, /Color: Red/);
    assert.match(msg, /Product link: http:\/\/localhost:\d+\/product\/e2e-test-overshirt/);
    await shop.reload();
    await settle(shop);
    assert.ok(await shop.locator('.gallery img').first().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0), 'image survives refresh');
    await shop.context().close();
  });

  await test('admin edits stock; storefront reflects it', async () => {
    await admin.goto(BASE + '/admin/products?q=E2E');
    await settle(admin);
    await admin.click('.prow__name:has-text("E2E Test Overshirt")');
    await settle(admin);
    await admin.fill('input[aria-label="Stock for size M in Red"]', '7');
    await admin.click('button:has-text("Review & save")');
    await admin.click('dialog button:has-text("Save changes")');
    await admin.waitForSelector('.toast--success');
    const shop = await newPage(1280, 860);
    await shop.goto(BASE + '/product/e2e-test-overshirt');
    await settle(shop);
    await shop.click('button.swatch[aria-label^="Red"]');
    assert.ok(!(await shop.locator('.size:has-text("M")').isDisabled()), 'M now available in Red');
    await shot(shop, 'product-desktop', false);
    await shop.context().close();
  });

  await test('admin hides then deletes the product; storefront 404s', async () => {
    await admin.goto(BASE + '/admin/products?q=E2E');
    await settle(admin);
    await admin.screenshot({ path: `${SHOTS}/admin-products.png`, fullPage: true });
    await admin.click('.prow button[role=switch]:has-text("Live")');
    await admin.waitForSelector('.toast--success');
    const res = await admin.request.get(BASE + '/api/products/e2e-test-overshirt');
    assert.equal(res.status(), 404, 'hidden product not public');
    await admin.click('button[aria-label="Delete E2E Test Overshirt"]');
    await admin.click('dialog button:has-text("Delete product")');
    await admin.waitForSelector('.empty-mini');
  });

  await test('admin mobile layout has no horizontal scroll', async () => {
    const m = await newPage(390, 844);
    await m.context().addCookies(await admin.context().cookies());
    for (const path of ['/admin', '/admin/products', '/admin/products/new', '/admin/settings']) {
      await m.goto(BASE + path);
      await settle(m);
      await noHorizontalScroll(m);
    }
    await m.goto(BASE + '/admin/products/new');
    await settle(m);
    await m.screenshot({ path: `${SHOTS}/admin-form-mobile.png`, fullPage: true });
    await m.context().close();
  });

  await test('sign out ends the session', async () => {
    // Reset the WhatsApp number so the test can be re-run from the same state.
    const reset = await admin.request.put(BASE + '/api/admin/settings', { data: { whatsappNumber: '' }, headers: { origin: BASE } });
    assert.equal(reset.status(), 200);
    await admin.goto(BASE + '/admin');
    await settle(admin);
    await admin.click('button:has-text("Sign out")');
    await admin.waitForURL(/\/admin\/login/);
    const res = await admin.request.get(BASE + '/api/admin/stats');
    assert.equal(res.status(), 401);
  });

  await test('no console errors during the run', async () => {
    assert.deepEqual(errors, []);
  });

  console.log(`\n${passed} UI checks passed. Screenshots in ${SHOTS}/`);
} finally {
  await browser.close();
}
