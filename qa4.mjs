export default async function run(page) {
  const events = [];
  page.on('pageerror', (e) => events.push('PAGEERROR: ' + (e.stack || String(e))));
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type())) {
      events.push(m.type().toUpperCase() + ': ' + m.text().slice(0, 800));
    }
  });

  await page.goto('http://localhost:5173/login');
  await page.getByLabel('Email').fill('qa.user@example.com');
  await page.getByLabel('Password').fill('QaPassw0rd!123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForTimeout(8000);
  await page.screenshot({ path: 'd:/Mohit/qa_after_login.png', fullPage: true });
  return { url: page.url(), events };
}
