const { GarminConnect } = require('..');
const {
    username: USERNAME,
    password: PASSWORD
} = require('../config/load-config');

const main = async () => {
    const GCClient = new GarminConnect({
        username: USERNAME,
        password: PASSWORD
    });
    await GCClient.login(USERNAME, PASSWORD);

    // Log tokens for debugging
    console.log(
        'oauth1Token:',
        GCClient.client.oauth1Token ? '[present]' : '[missing]'
    );
    console.log(
        'oauth2Token:',
        GCClient.client.oauth2Token ? GCClient.client.oauth2Token : '[missing]'
    );

    // Retry getActivities with mobile User-Agent
    try {
        const activities = await GCClient.getActivities(0, 5);
        console.log('Activities (first 5):', activities);
    } catch (err) {
        console.error('First fetch failed, retrying with mobile User-Agent...');
        try {
            const activities2 = await GCClient.client.get(
                '/activitylist-service/activities/search/activities',
                {
                    params: { start: 0, limit: 5 },
                    headers: {
                        'User-Agent': 'com.garmin.android.apps.connectmobile'
                    }
                }
            );
            console.log('Activities (retry):', activities2);
        } catch (err2) {
            console.error('Retry fetch failed:', err2);
        }
    }
};

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
