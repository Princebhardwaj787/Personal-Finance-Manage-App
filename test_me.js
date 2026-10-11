const http = require('http');

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJjbXVqZzU0NzYwMDAweXB1Z3d6bTJpMXd5IiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiaWF0IjoxNzkwNDkxMjY2LCJleHAiOjE3OTEwOTYwNjZ9.YBYluGuZHXZxrEer9_zRx1W8X7vbTo69iJABW0tIh-Y';

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/auth/me',
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => {
    body += chunk;
  });
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Body:', body);
  });
});

req.on('error', (e) => {
  console.error('Error:', e.message);
});

req.end();