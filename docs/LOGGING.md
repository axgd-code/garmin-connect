# Configuration du niveau de logging

Par défaut, seules les **erreurs** sont affichées dans la console. Vous pouvez configurer le niveau de logging selon vos besoins.

## Niveaux disponibles

-   `'silent'` : Aucun log
-   `'error'` : Erreurs uniquement (défaut)
-   `'warn'` : Erreurs + warnings
-   `'info'` : Erreurs + warnings + infos (login, token refresh, etc.)
-   `'debug'` : Tous les logs y compris détails techniques (requêtes HTTP, OAuth, etc.)

## Exemple d'utilisation

```typescript
import GarminConnect from 'garmin-connect';

// Configuration par défaut (erreurs uniquement)
const client = new GarminConnect({
    username: 'your-email@example.com',
    password: 'your-password'
});

// Activer les logs d'info (login, refresh, etc.)
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

// Activer le mode debug complet (pour troubleshooting)
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

// Mode silencieux (aucun log, même les erreurs)
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

## Qu'affiche chaque niveau ?

### `error` (défaut)

```
❌ HTTP 401 Error
❌ Cloudflare protection detected
❌ Step3 POST failed: ...
```

### `warn`

Erreurs + warnings :

```
⚠️  Token load via plugin data failed
⚠️  HTTP 429 received - retrying in 2000ms
⚠️  checkTokenValid failed: ...
```

### `info`

Erreurs + warnings + infos :

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

Tous les logs + détails techniques :

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

## Recommandations

-   **Production** : Utilisez `'error'` (défaut) ou `'silent'`
-   **Développement** : Utilisez `'info'` pour voir le flux principal
-   **Debug/Troubleshooting** : Utilisez `'debug'` pour voir tous les détails
-   **Tests automatisés** : Utilisez `'silent'` pour éviter la pollution des logs
