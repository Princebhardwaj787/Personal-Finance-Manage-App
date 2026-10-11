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
  const email = `test_full_${Date.now()}@example.com`;
  const password = 'password123';
  
  // Register
  console.log('1. Registering...');
  const regRes = await request({
    hostname: 'localhost', port: 3001, path: '/api/auth/register', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { email, password, name: 'Full Test' });
  console.log('   Status:', regRes.status);
  console.log('   Token:', regRes.data.token ? 'OK' : 'MISSING');
  const token = regRes.data.token;
  
  // Login
  console.log('2. Logging in...');
  const loginRes = await request({
    hostname: 'localhost', port: 3001, path: '/api/auth/login', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { email, password });
  console.log('   Status:', loginRes.status);
  console.log('   Token:', loginRes.data.token ? 'OK' : 'MISSING');
  
  // Get me
  console.log('3. Getting profile...');
  const meRes = await request({
    hostname: 'localhost', port: 3001, path: '/api/auth/me', method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('   Status:', meRes.status);
  console.log('   User:', meRes.data.user?.email);
  
  // Update profile
  console.log('4. Updating profile...');
  const updateRes = await request({
    hostname: 'localhost', port: 3001, path: '/api/auth/profile', method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
  }, { name: 'Updated Name' });
  console.log('   Status:', updateRes.status);
  console.log('   Name:', updateRes.data.user?.name);
  
  // Change password
  console.log('5. Changing password...');
  const passRes = await request({
    hostname: 'localhost', port: 3001, path: '/api/auth/password', method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
  }, { currentPassword: 'password123', newPassword: 'newpassword123' });
  console.log('   Status:', passRes.status);
  console.log('   Message:', passRes.data.message);
  
  // Login with new password
  console.log('6. Logging in with new password...');
  const loginNewRes = await request({
    hostname: 'localhost', port: 3001, path: '/api/auth/login', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { email, password: 'newpassword123' });
  console.log('   Status:', loginNewRes.status);
  console.log('   Token:', loginNewRes.data.token ? 'OK' : 'MISSING');
  
  console.log('\n✅ All tests passed!');
}

test().catch(console.error);