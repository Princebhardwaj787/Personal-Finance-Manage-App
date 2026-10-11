const http = require('http');

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function test() {
  // Login
  const loginRes = await request({
    hostname: 'localhost', port: 3001, path: '/api/auth/login', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { email: 'test@example.com', password: 'password123' });
  const token = loginRes.data.token;
  
  // Get accounts
  const accountsRes = await request({
    hostname: 'localhost', port: 3001, path: '/api/accounts', method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const accountId = accountsRes.data.accounts[0].id;
  
  // Get categories
  const catsRes = await request({
    hostname: 'localhost', port: 3001, path: '/api/categories', method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const categoryId = catsRes.data.categories[0].id;
  
  console.log('Account ID:', accountId);
  console.log('Category ID:', categoryId);
  
  // Create transaction
  const txnRes = await request({
    hostname: 'localhost', port: 3001, path: '/api/transactions', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
  }, { type: 'EXPENSE', amount: 1500, description: 'Weekly groceries', accountId, categoryId, date: new Date().toISOString() });
  console.log('Status:', txnRes.status);
  console.log('Response:', txnRes.data);
}

test().catch(console.error);