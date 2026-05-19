const fs = require('fs');
const path = require('path');

const cfgPath = path.resolve(__dirname, 'local-config.json');
let fileCfg = {};
if (fs.existsSync(cfgPath)) {
    try {
        fileCfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) || {};
    } catch (e) {
        console.warn(
            'config/load-config: failed to parse local-config.json:',
            e.message
        );
    }
}

const username = process.env.GC_USERNAME || fileCfg.username;
const password = process.env.GC_PASSWORD || fileCfg.password;

module.exports = { username, password };
