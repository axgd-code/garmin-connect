# Logging Level Configuration

By default, only **errors** are printed to the console. You can configure the logging level based on your needs.

## Available Levels

-   `'silent'`: No logs
-   `'error'`: Errors only (default)
-   `'warn'`: Errors + warnings
-   `'info'`: Errors + warnings + info (login, token refresh, etc.)
-   `'debug'`: All logs including technical details (HTTP requests, OAuth, etc.)

## Usage Example

```typescript
import GarminConnect from 'garmin-connect-obsidian';

// Default configuration (errors only)
const client = new GarminConnect({
    username: 'your-email@example.com',
    password: 'your-password'
});

// Enable info logs (login, refresh, etc.)
const clientWithInfo = new GarminConnect(
    {
        username: 'your-email@example.com',
        password: 'your-password'
    },
    'garmin.com',
    {
        httpClientConfig: {
            logLevel: 'info'
        }
    }
);

// Enable full debug mode (for troubleshooting)
const clientDebug = new GarminConnect(
    {
        username: 'your-email@example.com',
        password: 'your-password'
    },
    'garmin.com',
    {
        httpClientConfig: {
            logLevel: 'debug'
        }
    }
);

// Silent mode (no logs, even errors)
const clientSilent = new GarminConnect(
    {
        username: 'your-email@example.com',
        password: 'your-password'
    },
    'garmin.com',
    {
        httpClientConfig: {
            logLevel: 'silent'
        }
    }
);
```

## What Does Each Level Show?

### `error` (default)

```
❌ HTTP 401 Error
❌ Cloudflare protection detected
❌ Step3 POST failed: ...
```

### `warn`

Errors + warnings:

```
⚠️  Token load via plugin data failed
⚠️  HTTP 429 received - retrying in 2000ms
⚠️  checkTokenValid failed: ...
```

### `info`

Errors + warnings + info:

```
ℹ️  🔐 Starting Garmin login...
ℹ️  🎫 Getting login ticket...
ℹ️  🔑 Getting OAuth1 token...
ℹ️  🔄 Exchanging for OAuth2 token...
ℹ️  ✅ Login successful!
ℹ️  ✅ Persisted tokens loaded from plugin data
ℹ️  Oauth2 token refreshed!
```

### `debug`

All logs + technical details:

```
🐛 🌐 REQUEST: POST https://sso.garmin.com/sso/signin...
🐛 🌐 HEADERS: {...}
🐛 ✅ RESPONSE STATUS: 200
🐛 CSRF token found: 3A87D2957E...
🐛 Ticket found in step3: ST-2861420...
🐛 🔑 getOauth1Token URL: https://connectapi.garmin.com/...
🐛 🔑 OAuth1 authorization headers: Authorization
🐛 🔑 OAuth1 response type: string length: 103
🐛 🔑 Parsed token keys: oauth_token, oauth_token_secret
🐛 🔄 exchange OAuth1 → OAuth2
🐛 🔄 OAuth1 token key: cf1ee7b1-e...
🐛 🔄 OAuth signature data keys: oauth_consumer_key, ...
🐛 ✅ OAuth2 token set, expires in: 68253 seconds
```

## Recommendations

-   **Production**: Use `'error'` (default) or `'silent'`
-   **Development**: Use `'info'` to see the main flow
-   **Debug/Troubleshooting**: Use `'debug'` to see all details
-   **Automated Tests**: Use `'silent'` to avoid log noise
