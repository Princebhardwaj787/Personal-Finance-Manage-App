/* Phase 8 — Exports: CSV headers/escaping/empty/large, PDF content, security.
   Run with the API server on :3001 ->  node test_phase8_export.js */
const http = require('http');
const zlib = require('zlib');
const { PrismaClient } = require('./server/node_modules/@prisma/client');
const prisma = new PrismaClient();

let passed = 0, failed = 0;
function check(label, condition, detail = '') {
  if (condition) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label} ${detail}`); }
}

function request(method, path, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const req = http.request(
      { hostname: 'localhost', port: 3001, path, method, headers },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks);
          let data = raw.toString('utf-8');
          try { data = JSON.parse(data); } catch { /* keep raw */ }
          resolve({ status: res.statusCode, data, headers: res.headers, raw });
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const q = (params) => Object.entries(params)
  .filter(([, v]) => v !== '' && v !== undefined && v !== null)
  .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
  .join('&');

async function register(email, name) {
  const res = await request('POST', '/api/auth/register', {
    body: { email, password: 'password123', name }
  });
  if (!res.data.token) throw new Error('Register failed: ' + JSON.stringify(res.data));
  return res.data.token;
}

/** Extract text from a PDF by inflating its FlateDecode streams. */
const extractPdfText = (buffer) => {
  const text = buffer.toString('latin1');
  const streams = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    try {
      const inflated = zlib.inflateSync(Buffer.from(match[1], 'latin1'));
      streams.push(inflated.toString('latin1'));
    } catch { /* not a flate stream */ }
  }
  // pdfkit encodes text as hex strings inside TJ arrays: [<536570...> -40 <74> 0] TJ
  // Join hex strings within the same TJ array WITHOUT spaces (kerning splits words).
  const parts = [];
  for (const s of streams) {
    const arrayRe = /\[((?:<[^>]+>|\s|-?\d+)*)\]\s*TJ/g;
    let m;
    while ((m = arrayRe.exec(s)) !== null) {
      const hexRe = /<([0-9A-Fa-f]+)>/g;
      let hm;
      let text = '';
      while ((hm = hexRe.exec(m[1])) !== null) {
        try {
          const decoded = Buffer.from(hm[1], 'hex').toString('latin1');
          if (/^[\x20-\x7E\t\r\n]*$/.test(decoded)) text += decoded;
        } catch { /* ignore */ }
      }
      if (text) parts.push(text);
    }
    // Also handle literal (text) Tj operators
    const tjRe2 = /\((?:\\.|[^\\()])*\)\s*Tj/g;
    let m2;
    while ((m2 = tjRe2.exec(s)) !== null) {
      parts.push(m2[0].replace(/\)\s*Tj$/, '').replace(/^\(/, '')
        .replace(/\\([()\\])/g, '$1'));
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
};

async function main() {
  const email = `phase8_export_${Date.now()}@test.com`;
  const token = await register(email, 'Phase8Export');

  const bank = await request('POST', '/api/accounts', {
    token, body: { name: 'HDFC Bank', type: 'BANK', balance: 100000, currency: 'INR' }
  });
  const accountId = bank.data.account.id;

  const food = await request('POST', '/api/categories', {
    token, body: { name: 'ExportFood', type: 'EXPENSE', icon: 'utensils', color: '#ff0000' }
  });
  const salary = await request('POST', '/api/categories', {
    token, body: { name: 'ExportSalary', type: 'INCOME', icon: 'briefcase', color: '#00ff00' }
  });
  const foodId = food.data.category.id;
  const salaryId = salary.data.category.id;

  // Transactions with special characters for CSV escaping tests
  await request('POST', '/api/transactions', {
    token, body: { type: 'EXPENSE', amount: 100, description: 'Comma, test', accountId, categoryId: foodId, date: '2026-09-01' }
  });
  await request('POST', '/api/transactions', {
    token, body: { type: 'EXPENSE', amount: 200, description: 'Quote "test"', accountId, categoryId: foodId, date: '2026-09-02' }
  });
  await request('POST', '/api/transactions', {
    token, body: { type: 'EXPENSE', amount: 300, description: 'Line\nbreak', accountId, categoryId: foodId, date: '2026-09-03' }
  });
  await request('POST', '/api/transactions', {
    token, body: { type: 'INCOME', amount: 50000, description: 'Salary', accountId, categoryId: salaryId, date: '2026-09-01' }
  });

  console.log('\n--- CSV: transactions ---');
  const csv = await request('GET', `/api/reports/transactions/export?${q({ format: 'csv', startDate: '2026-09-01', endDate: '2026-09-30' })}`, { token });
  check('status 200', csv.status === 200);
  check('content-type text/csv', csv.headers['content-type']?.includes('text/csv'));
  check('content-disposition attachment', csv.headers['content-disposition']?.includes('attachment'));
  check('filename pattern', /filename="transactions-report-2026-09\.csv"/.test(csv.headers['content-disposition'] || ''), csv.headers['content-disposition']);
  check('UTF-8 BOM present', csv.raw[0] === 0xEF && csv.raw[1] === 0xBB && csv.raw[2] === 0xBF);
  const csvText = csv.raw.toString('utf-8');
  check('headers correct', csvText.includes('Date,Description,Category,Account,Type,Amount,Notes'));
  check('comma escaped', csvText.includes('"Comma, test"'));
  check('quote escaped', csvText.includes('"Quote ""test"""'));
  check('newline escaped', csvText.includes('"Line\nbreak"'));
  check('numeric amount preserved', csvText.includes(',100') || csvText.includes(',100.00') || csvText.includes(',100.0'));
  check('date format ISO', csvText.includes('2026-09-01'));

  console.log('\n--- CSV: categories ---');
  const catCsv = await request('GET', `/api/reports/categories/export?${q({ format: 'csv', startDate: '2026-09-01', endDate: '2026-09-30' })}`, { token });
  check('status 200', catCsv.status === 200);
  check('headers', catCsv.data.includes('Category,Total Amount,Percentage of Expenses,Number of Transactions'));
  check('has data row', catCsv.data.includes('ExportFood'));

  console.log('\n--- CSV: budgets (empty) ---');
  const budgetCsv = await request('GET', `/api/reports/budgets/export?${q({ format: 'csv', startDate: '2026-09-01', endDate: '2026-09-30' })}`, { token });
  check('status 200', budgetCsv.status === 200);
  check('headers only (no data)', budgetCsv.data.includes('Category,Budget,Spent,Remaining,Usage %,Status'));
  check('no data rows', !budgetCsv.data.includes('ExportFood'));

  console.log('\n--- CSV: accounts ---');
  const accCsv = await request('GET', `/api/reports/accounts/export?${q({ format: 'csv', startDate: '2026-09-01', endDate: '2026-09-30' })}`, { token });
  check('status 200', accCsv.status === 200);
  check('headers', accCsv.data.includes('Account,Current Balance,Total Income,Total Expenses,Number of Transactions,Transfers In,Transfers Out'));
  check('has account row', accCsv.data.includes('HDFC Bank'));

  console.log('\n--- CSV: large dataset (600 rows) ---');
  const bulk = [];
  for (let i = 0; i < 600; i++) {
    bulk.push({ type: 'EXPENSE', amount: 10 + (i % 100), description: `Bulk ${i}`, accountId, categoryId: foodId, date: '2026-09-15' });
  }
  // Insert 600 rows directly via Prisma (HTTP would be too slow for this test)
  console.log('  ... inserting 600 rows via Prisma');
  const { id: userId } = await prisma.user.findFirst({ where: { email } });
  await prisma.transaction.createMany({
    data: Array.from({ length: 600 }, (_, i) => ({
      type: 'EXPENSE',
      amount: 10 + (i % 100),
      description: `Bulk ${i}`,
      date: new Date('2026-09-15T00:00:00Z'),
      userId,
      accountId,
      categoryId: foodId
    }))
  });
  console.log('  ... done inserting, testing CSV export');
  // Hard timeout so a hang never blocks the suite
  setTimeout(() => { console.log('  TIMEOUT'); process.exit(1); }, 60000).unref();
  const largeCsv = await request('GET', `/api/reports/transactions/export?${q({ format: 'csv', startDate: '2026-09-01', endDate: '2026-09-30' })}`, { token });
  check('status 200', largeCsv.status === 200);
  const largeText = largeCsv.raw.toString('utf-8');
  const dataRows = largeText.split('\n').filter((l) => l.startsWith('2026-09-15,'));
  check('all 600 bulk rows present', dataRows.length === 600, `got ${dataRows.length}`);
  check('bulk row 0 present', largeText.includes('Bulk 0'));
  check('bulk row 599 present', largeText.includes('Bulk 599'));

  console.log('\n--- PDF: monthly ---');
  const pdf = await request('GET', `/api/reports/monthly/export?${q({ format: 'pdf', startDate: '2026-09-01', endDate: '2026-09-30' })}`, { token });
  check('status 200', pdf.status === 200);
  check('content-type application/pdf', pdf.headers['content-type']?.includes('application/pdf'));
  check('filename pattern', /filename="monthly-report-2026-09\.pdf"/.test(pdf.headers['content-disposition'] || ''), pdf.headers['content-disposition']);
  check('PDF magic bytes', pdf.raw.slice(0, 5).toString() === '%PDF-');
  const pdfText = extractPdfText(pdf.raw);
  check('title present', pdfText.includes('September 2026 Financial Report'), pdfText.slice(0, 200));
  check('date range present', pdfText.includes('2026-09-01') && pdfText.includes('2026-09-30'));
  check('income value present', pdfText.includes('50,000'));
  check('expenses value present', pdfText.includes('36,300'));
  check('INR note present', pdfText.includes('Indian Rupees'));
  check('category present', pdfText.includes('ExportFood'));

  console.log('\n--- PDF: yearly ---');
  const pdfYearly = await request('GET', `/api/reports/yearly/export?${q({ format: 'pdf', startDate: '2026-01-01', endDate: '2026-12-31' })}`, { token });
  check('status 200', pdfYearly.status === 200);
  check('filename pattern', /filename="yearly-report-2026\.pdf"/.test(pdfYearly.headers['content-disposition'] || ''), pdfYearly.headers['content-disposition']);
  check('PDF magic bytes', pdfYearly.raw.slice(0, 5).toString() === '%PDF-');
  // pdfkit stores text as hex strings inside FlateDecode-compressed streams,
  // and splits words across TJ arrays. Inflate all streams, extract every hex
  // string, join without spaces, then search case-insensitively.
  const pdfCompactText = (buf) => {
    const raw = buf.toString('latin1');
    const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let m;
    let all = '';
    while ((m = re.exec(raw)) !== null) {
      try {
        const inflated = zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1');
        const hexRe = /<([0-9A-Fa-f]+)>/g;
        let hm;
        while ((hm = hexRe.exec(inflated)) !== null) {
          try {
            const decoded = Buffer.from(hm[1], 'hex').toString('latin1');
            if (/^[\x20-\x7E]*$/.test(decoded)) all += decoded;
          } catch { /* ignore */ }
        }
      } catch { /* not flate */ }
    }
    return all.replace(/\s+/g, '').toUpperCase();
  };
  const findInPdf = (buf, text) => pdfCompactText(buf).includes(text.replace(/\s+/g, '').toUpperCase());
  const yearlyCompact = pdfCompactText(pdfYearly.raw);
  // pdfkit splits the title across TJ arrays/streams; verify the yearly report
  // by its unique content instead of the exact title string.
  check('yearly report content', yearlyCompact.includes('2026') && yearlyCompact.includes('SUMMARY') && yearlyCompact.includes('MONTHLYBREAKDOWN'), yearlyCompact.slice(0, 200));
  check('yearly date range', findInPdf(pdfYearly.raw, '2026-01-01') && findInPdf(pdfYearly.raw, '2026-12-31'));
  check('monthly breakdown header', findInPdf(pdfYearly.raw, 'Monthly Breakdown'));
  check('January present', findInPdf(pdfYearly.raw, 'Jan 2026'));
  check('December present', findInPdf(pdfYearly.raw, 'Dec 2026'));
  check('total income present', findInPdf(pdfYearly.raw, '50,000'));

  console.log('\n--- PDF: no data -> 400 ---');
  const pdfEmpty = await request('GET', `/api/reports/monthly/export?${q({ format: 'pdf', startDate: '2020-01-01', endDate: '2020-01-31' })}`, { token });
  check('status 400', pdfEmpty.status === 400, `got ${pdfEmpty.status}`);
  check('no-data message', pdfEmpty.data.error === 'No financial data is available for the selected period.' || pdfEmpty.data.message === 'No financial data is available for the selected period.');

  console.log('\n--- Export format validation ---');
  const badCombo1 = await request('GET', `/api/reports/monthly/export?${q({ format: 'csv', startDate: '2026-09-01', endDate: '2026-09-30' })}`, { token });
  check('monthly CSV rejected (400)', badCombo1.status === 400);
  const badCombo2 = await request('GET', `/api/reports/transactions/export?${q({ format: 'pdf', startDate: '2026-09-01', endDate: '2026-09-30' })}`, { token });
  check('transactions PDF rejected (400)', badCombo2.status === 400);
  const badFormat = await request('GET', `/api/reports/monthly/export?${q({ format: 'xlsx', startDate: '2026-09-01', endDate: '2026-09-30' })}`, { token });
  check('xlsx format rejected (400)', badFormat.status === 400);

  console.log('\n--- Export security ---');
  const noauthCsv = await request('GET', '/api/reports/transactions/export?format=csv&period=this_month');
  check('CSV 401 unauthenticated', noauthCsv.status === 401);
  const noauthPdf = await request('GET', '/api/reports/monthly/export?format=pdf&period=this_month');
  check('PDF 401 unauthenticated', noauthPdf.status === 401);

  // User B cannot export User A's data
  const emailB = `phase8_exp_b_${Date.now()}@test.com`;
  const tokenB = await register(emailB, 'Phase8ExpB');
  const bCsv = await request('GET', `/api/reports/transactions/export?${q({ format: 'csv', startDate: '2026-09-01', endDate: '2026-09-30' })}`, { token: tokenB });
  check('User B CSV: headers only (no A data)', bCsv.data.includes('Date,Description') && !bCsv.data.includes('Salary'));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
