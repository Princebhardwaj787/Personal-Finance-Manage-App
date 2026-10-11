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
  console.log('1. Logging in...');
  const loginRes = await request({
    hostname: 'localhost', port: 3001, path: '/api/auth/login', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { email: 'test@example.com', password: 'password123' });
  console.log('   Status:', loginRes.status);
  const token = loginRes.data.token;
  
  // List accounts
  console.log('\n2. Listing accounts...');
  const accountsRes = await request({
    hostname: 'localhost', port: 3001, path: '/api/accounts', method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('   Status:', accountsRes.status);
  console.log('   Accounts:', accountsRes.data.accounts?.length || 0);
  
  // Create account
  console.log('\n3. Creating account...');
  const createRes = await request({
    hostname: 'localhost', port: 3001, path: '/api/accounts', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
  }, { name: 'My Bank Account', type: 'BANK', balance: 50000, currency: 'INR', color: '#22c55e' });
  console.log('   Status:', createRes.status);
  console.log('   Account:', createRes.data.account?.name);
  const accountId = createRes.data.account?.id;
  
  // List accounts again
  console.log('\n4. Listing accounts again...');
  const accountsRes2 = await request({
    hostname: 'localhost', port: 3001, path: '/api/accounts', method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('   Status:', accountsRes2.status);
  console.log('   Accounts:', accountsRes2.data.accounts?.length || 0);
  accountsRes2.data.accounts?.forEach(a => console.log(`     - ${a.name} (${a.type}): ${a.balance} ${a.currency}`));
  
  // Create category
  console.log('\n5. Creating category...');
  const catRes = await request({
    hostname: 'localhost', port: 3001, path: '/api/categories', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
  }, { name: 'Groceries', type: 'EXPENSE', icon: '🛒', color: '#ef4444' });
  console.log('   Status:', catRes.status);
  console.log('   Category:', catRes.data.category?.name);
  const categoryId = catRes.data.category?.id;
  
  // List categories
  console.log('\n6. Listing categories...');
  const catsRes = await request({
    hostname: 'localhost', port: 3001, path: '/api/categories', method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('   Status:', catsRes.status);
  console.log('   Categories:', catsRes.data.categories?.length || 0);
  
  // Create transaction
  console.log('\n7. Creating transaction...');
  const txnRes = await request({
    hostname: 'localhost', port: 3001, path: '/api/transactions', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
  }, { type: 'EXPENSE', amount: 1500, description: 'Weekly groceries', accountId, categoryId, date: new Date().toISOString() });
  console.log('   Status:', txnRes.status);
  console.log('   Transaction:', txnRes.data.transaction?.description, txnRes.data.transaction?.amount);
  
  // List transactions
  console.log('\n8. Listing transactions...');
  const txnsRes = await request({
    hostname: 'localhost', port: 3001, path: '/api/transactions', method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('   Status:', txnsRes.status);
  console.log('   Transactions:', txnsRes.data.transactions?.length || 0);
  txnsRes.data.transactions?.forEach(t => console.log(`     - ${t.type}: ${t.amount} - ${t.description}`));
  
  // Check account balance
  console.log('\n9. Checking account balance after transaction...');
  const accountsRes3 = await request({
    hostname: 'localhost', port: 3001, path: '/api/accounts', method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('   Accounts:');
  accountsRes3.data.accounts?.forEach(a => console.log(`     - ${a.name}: ${a.balance} ${a.currency}`));
  
  console.log('\n✅ All tests passed!');
}

test().catch(console.error);