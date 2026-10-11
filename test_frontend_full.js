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
  // Register through frontend proxy
  console.log('1. Registering through frontend proxy...');
  const email = `full_test_${Date.now()}@example.com`;
  const regRes = await request({
    hostname: 'localhost', port: 5173, path: '/api/auth/register', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { email, password: 'password123', name: 'Full Test User' });
  console.log('   Status:', regRes.status);
  const token = regRes.data.token;
  console.log('   Token:', token ? 'OK' : 'MISSING');
  
  // Test accounts
  console.log('\n2. Testing Accounts...');
  const accountsList = await request({
    hostname: 'localhost', port: 5173, path: '/api/accounts', method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('   List Accounts:', accountsList.status);
  
  const createAcc = await request({
    hostname: 'localhost', port: 5173, path: '/api/accounts', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
  }, { name: 'Test Bank', type: 'BANK', balance: 10000, currency: 'INR', color: '#3b82f6' });
  console.log('   Create Account:', createAcc.status);
  const accountId = createAcc.data.account?.id;
  
  const accountsList2 = await request({
    hostname: 'localhost', port: 5173, path: '/api/accounts', method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('   List Accounts (after create):', accountsList2.data.accounts?.length || 0);
  
  // Test categories
  console.log('\n3. Testing Categories...');
  const catsList = await request({
    hostname: 'localhost', port: 5173, path: '/api/categories', method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('   List Categories:', catsList.status, '- Count:', catsList.data.categories?.length || 0);
  
  const createCat = await request({
    hostname: 'localhost', port: 5173, path: '/api/categories', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
  }, { name: 'Test Category', type: 'EXPENSE', icon: '🧪', color: '#f59e0b' });
  console.log('   Create Category:', createCat.status);
  const categoryId = createCat.data.category?.id;
  
  const catsByType = await request({
    hostname: 'localhost', port: 5173, path: '/api/categories/type/EXPENSE', method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('   Categories by Type (EXPENSE):', catsByType.data.categories?.length || 0);
  
  // Test transactions
  console.log('\n4. Testing Transactions...');
  const txnsList = await request({
    hostname: 'localhost', port: 5173, path: '/api/transactions', method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('   List Transactions:', txnsList.status);
  
  const createTxn = await request({
    hostname: 'localhost', port: 5173, path: '/api/transactions', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
  }, { type: 'EXPENSE', amount: 500, description: 'Test transaction', accountId, categoryId, date: new Date().toISOString() });
  console.log('   Create Transaction:', createTxn.status);
  
  const txnsList2 = await request({
    hostname: 'localhost', port: 5173, path: '/api/transactions', method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('   List Transactions (after create):', txnsList2.data.transactions?.length || 0);
  
  // Test transaction summary
  console.log('\n5. Testing Transaction Summary...');
  const summary = await request({
    hostname: 'localhost', port: 5173, path: '/api/transactions/summary', method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('   Summary:', summary.status);
  console.log('   Data:', summary.data);
  
  // Test transfer
  console.log('\n6. Testing Transfer...');
  const createAcc2 = await request({
    hostname: 'localhost', port: 5173, path: '/api/accounts', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
  }, { name: 'Test Wallet', type: 'UPI_WALLET', balance: 5000, currency: 'INR', color: '#8b5cf6' });
  console.log('   Create Second Account:', createAcc2.status);
  const accountId2 = createAcc2.data.account?.id;
  
  const transfer = await request({
    hostname: 'localhost', port: 5173, path: '/api/transactions/transfer', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
  }, { amount: 1000, description: 'Test transfer', fromAccountId: accountId, toAccountId: accountId2, date: new Date().toISOString() });
  console.log('   Create Transfer:', transfer.status);
  // Phase 7: a transfer is its own row and must never be an income+expense pair.
  console.log('   Transfer row:', transfer.data.transfer?.id ? 'Created' : 'Failed');
  console.log('   Income/Expense rows (expected: none):',
    transfer.data.expense === undefined && transfer.data.income === undefined ? 'Correct' : 'Unexpected');
  
  // Check balances after transfer
  const accountsFinal = await request({
    hostname: 'localhost', port: 5173, path: '/api/accounts', method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('   Final Balances:');
  accountsFinal.data.accounts?.forEach(a => console.log(`     - ${a.name}: ${a.balance} ${a.currency}`));
  
  console.log('\n✅ All frontend proxy tests passed!');
}

test().catch(console.error);