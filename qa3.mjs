import fs from 'node:fs';

export default async function run(page) {
  const log = [];
  const res = await page.request.post('http://localhost:5173/api/auth/login', {
    data: { email: 'qa.user@example.com', password: 'QaPassw0rd!123' }
  });
  log.push('status ' + res.status());
  log.push((await res.text()).slice(0, 500));
  fs.writeFileSync('d:/Mohit/qa_login_response.txt', log.join('\n'));
  return log;
}
