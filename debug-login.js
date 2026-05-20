const http = require('http');
const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'x-real-ip': '127.0.0.1'
    }
};
const req = http.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Headers:', JSON.stringify(res.headers, null, 2));
        console.log('Body:', data);
    });
});
req.on('error', (e) => console.error('Request error:', e.message));
req.write(JSON.stringify({ username: 'qa_test_user', password: 'TestPass123!' }));
req.end();
