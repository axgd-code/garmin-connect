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
    const activities = await GCClient.getActivities(0, 5);
    console.log('Activities (first 5):', activities);
};

main().catch((err) => {
    console.error('Error fetching activities:', err);
    process.exit(1);
});
