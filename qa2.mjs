export default async function run(page, ui) {
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + (e.stack || String(e))));

  await page.goto('http://localhost:5173/login');
  const snap = await ui.snapshot();
  const ref = (re) => snap.match(re)?.[1];
  const email = ref(/@(e\d+) textbox.*Email/);
  const pass = ref(/@(e\d+) textbox.*Password/);
  const btn = ref(/@(e\d+) button "Sign in"/);

  await ui.fill(email, 'qa.user@example.com');
  await ui.fill(pass, 'QaPassw0rd!123');
  await ui.click(btn);
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'd:/Mohit/qa_after_login.png', fullPage: true });
  return { url: page.url(), errors };
}
