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

async function testFrontendProxy() {
  const email = `proxy_test_${Date.now()}@example.com`;
  const password = 'password123';
  
  // Test through frontend proxy (port 5173)
  console.log('Testing through frontend proxy (port 5173)...');
  
  const regRes = await request({
    hostname: 'localhost', port: 5173, path: '/api/auth/register', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { email, password, name: 'Proxy Test' });
  console.log('Register Status:', regRes.status);
  console.log('Token:', regRes.data.token ? 'OK' : 'MISSING');
  
  if (regRes.data.token) {
    const meRes = await request({
      hostname: 'localhost', port: 5173, path: '/api/auth/me', method: 'GET',
      headers: { 'Authorization': `Bearer ${regRes.data.token}` }
    });
    console.log('Me Status:', meRes.status);
    console.log('User:', meRes.data.user?.email);
    console.log('\n✅ Frontend proxy working!');
  }
}

testFrontendProxy().catch(console.error);