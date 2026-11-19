export default async function run(page) {
  const events = [];
  page.on('pageerror', (e) => events.push('PAGEERROR: ' + (e.stack || String(e)).slice(0, 2000)));
  page.on('console', (m) => {
    const t = m.type();
    if (t === 'error' || t === 'warning') events.push(t.toUpperCase() + ': ' + m.text().slice(0, 1000));
  });

  await page.goto('http://localhost:5173/login');
  await page.getByLabel('Email').fill('qa.user@example.com');
  await page.getByLabel('Password').fill('QaPassw0rd!123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard').catch(() => { });
  await page.waitForTimeout(1000);

  // Force a real reload of /dashboard — module-level state (e.g. a failed
  // lazy import) does not survive a reload, so this distinguishes a module
  // cache issue from a render bug.
  await page.reload();
  await page.waitForTimeout(5000);
  const html = await page.evaluate(() => document.body.innerHTML.slice(0, 800));
  const htmlLen = await page.evaluate(() => document.body.innerHTML.length);
  await page.screenshot({ path: 'd:/Mohit/qa_reload.png', fullPage: true });
  return { url: page.url(), htmlLen, html, events };
}
