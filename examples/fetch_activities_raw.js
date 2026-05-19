const https = require('https');
const { GarminConnect } = require('..');
const {
    username: USERNAME,
    password: PASSWORD
} = require('../config/load-config');

function httpGetRaw(urlStr, headers) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlStr);
        const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: 'GET',
            headers
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () =>
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: data
                })
            );
        });
        req.on('error', reject);
        req.end();
    });
}

const main = async () => {
    const GCClient = new GarminConnect({
        username: USERNAME,
        password: PASSWORD
    });
    await GCClient.login(USERNAME, PASSWORD);
    console.log('oauth2Token present:', !!GCClient.client.oauth2Token);
    if (!GCClient.client.oauth2Token) {
        console.error('No oauth2 token after login');
        return;
    }
    const token = GCClient.client.oauth2Token.access_token;
    const url = GCClient.url.ACTIVITIES + '?start=0&limit=5';
    console.log('Calling raw URL:', url);
    const headers = {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'com.garmin.android.apps.connectmobile',
        Accept: 'application/json, text/plain, */*'
    };
    const resp = await httpGetRaw(url, headers);
    console.log('Raw response status:', resp.status);
    console.log('Raw response headers:', resp.headers);
    console.log('Raw body (first 800 chars):', resp.body.substring(0, 800));
};

main().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
});
