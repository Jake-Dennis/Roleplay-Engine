const http = require('http');

function request(method, path, body, headers = {}) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: method,
            headers: { 'Content-Type': 'application/json', 'x-real-ip': '127.0.0.1', ...headers }
        };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

async function runTests() {
    const results = [];
    
    // Test 1: Health - live
    try {
        const r = await request('GET', '/api/health/live');
        results.push({ test: 'GET /api/health/live', status: r.status === 200 ? 'PASS' : 'FAIL', detail: r.body });
    } catch (e) { results.push({ test: 'GET /api/health/live', status: 'ERROR', detail: e.message }); }

    // Test 2: Health - ready (with localhost IP)
    try {
        const r = await request('GET', '/api/health/ready');
        results.push({ test: 'GET /api/health/ready', status: r.status === 200 ? 'PASS' : 'FAIL', detail: r.body });
    } catch (e) { results.push({ test: 'GET /api/health/ready', status: 'ERROR', detail: e.message }); }

    // Test 3: Login
    let cookie = '';
    let userId = '';
    try {
        const r = await request('POST', '/api/auth/login', JSON.stringify({ username: 'qa_test_user', password: 'TestPass123!' }));
        const setCookie = r.headers['set-cookie'];
        if (setCookie) {
            cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
            cookie = cookie.split(';')[0];
        }
        const body = JSON.parse(r.body);
        userId = body.user?.id || '';
        results.push({ test: 'POST /api/auth/login', status: r.status === 200 ? 'PASS' : 'FAIL', detail: r.status === 200 ? 'OK' : r.body });
    } catch (e) { results.push({ test: 'POST /api/auth/login', status: 'ERROR', detail: e.message }); }

    // Test 4: GET /api/auth/me (with cookie)
    try {
        const r = await request('GET', '/api/auth/me', null, { Cookie: cookie });
        results.push({ test: 'GET /api/auth/me', status: r.status === 200 ? 'PASS' : 'FAIL', detail: r.body });
    } catch (e) { results.push({ test: 'GET /api/auth/me', status: 'ERROR', detail: e.message }); }

    // Test 5: Unauthorized access (no cookie)
    try {
        const r = await request('GET', '/api/auth/me');
        results.push({ test: 'GET /api/auth/me (no auth)', status: r.status === 401 ? 'PASS' : 'FAIL', detail: r.body });
    } catch (e) { results.push({ test: 'GET /api/auth/me (no auth)', status: 'ERROR', detail: e.message }); }

    // Test 6: Wiki path traversal
    try {
        const r = await request('GET', '/api/wiki/..%2F..%2F..%2Fetc%2Fpasswd', null, { Cookie: cookie });
        results.push({ test: 'Wiki path traversal blocked', status: (r.status === 400 || r.status === 403 || r.status === 404) ? 'PASS' : 'FAIL', detail: r.status + ' ' + r.body });
    } catch (e) { results.push({ test: 'Wiki path traversal blocked', status: 'ERROR', detail: e.message }); }

    // Test 7: Pagination on sessions list
    try {
        const r = await request('GET', '/api/sessions?page=1&limit=5', null, { Cookie: cookie });
        results.push({ test: 'GET /api/sessions (pagination)', status: r.status === 200 ? 'PASS' : 'FAIL', detail: r.body.substring(0, 200) });
    } catch (e) { results.push({ test: 'GET /api/sessions (pagination)', status: 'ERROR', detail: e.message }); }

    // Test 8: Error response includes requestId
    try {
        const r = await request('POST', '/api/auth/login', JSON.stringify({ username: '', password: '' }));
        const body = JSON.parse(r.body);
        results.push({ test: 'Error has requestId', status: body.requestId ? 'PASS' : 'FAIL', detail: JSON.stringify(body) });
    } catch (e) { results.push({ test: 'Error has requestId', status: 'ERROR', detail: e.message }); }

    // Test 9: Invalid input - empty body
    try {
        const r = await request('POST', '/api/auth/login', '{}');
        results.push({ test: 'Empty login body', status: r.status === 400 ? 'PASS' : 'FAIL', detail: r.body });
    } catch (e) { results.push({ test: 'Empty login body', status: 'ERROR', detail: e.message }); }

    // Test 10: Logout
    try {
        const r = await request('POST', '/api/auth/logout', null, { Cookie: cookie });
        results.push({ test: 'POST /api/auth/logout', status: r.status === 200 ? 'PASS' : 'FAIL', detail: r.body });
    } catch (e) { results.push({ test: 'POST /api/auth/logout', status: 'ERROR', detail: e.message }); }

    // Test 11: Use token after logout (should fail)
    try {
        const r = await request('GET', '/api/auth/me', null, { Cookie: cookie });
        results.push({ test: 'Token after logout', status: r.status === 401 ? 'PASS' : 'FAIL', detail: r.body });
    } catch (e) { results.push({ test: 'Token after logout', status: 'ERROR', detail: e.message }); }

    // Print results
    console.log('\n=== QA TEST RESULTS ===');
    let pass = 0, fail = 0, error = 0;
    for (const r of results) {
        console.log(r.status + ': ' + r.test);
        if (r.detail && r.detail.length > 100) {
            console.log('  ' + r.detail.substring(0, 100) + '...');
        } else {
            console.log('  ' + r.detail);
        }
        if (r.status === 'PASS') pass++;
        else if (r.status === 'FAIL') fail++;
        else error++;
    }
    console.log('\nTotal: ' + results.length + ' | Pass: ' + pass + ' | Fail: ' + fail + ' | Error: ' + error);
}

runTests().catch(console.error);
