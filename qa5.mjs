export default async function run(page) {
  const events = [];
  page.on('pageerror', (e) => events.push('PAGEERROR: ' + (e.stack || String(e))));
  page.on('console', (m) => events.push(m.type().toUpperCase() + ': ' + m.text().slice(0, 500)));

  await page.goto('http://localhost:5173/login');
  await page.getByLabel('Email').fill('qa.user@example.com');
  await page.getByLabel('Password').fill('QaPassw0rd!123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForTimeout(8000);

  const dom = await page.evaluate(() => ({
    url: location.href,
    token: !!localStorage.getItem('token'),
    html: document.body.innerHTML.slice(0, 3000),
  }));
  await page.screenshot({ path: 'd:/Mohit/qa_after_login.png', fullPage: true });
  return { dom, events };
}
