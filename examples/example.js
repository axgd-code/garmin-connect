const { GarminConnect } = require('..');
const {
    username: USERNAME,
    password: PASSWORD
} = require('../config/load-config');

// Has to be run in an async function to be able to use the await keyword
const main = async () => {
    // Create a new Garmin Connect Client
    const GCClient = new GarminConnect({
        username: USERNAME,
        password: PASSWORD
    });

    // TODO: Test China Domain
    // China Domain
    // const GCClient = new GarminConnect({
    //     username: 'your-email',
    //     password: 'your-password'
    // }, 'garmin.cn');

    // Uses credentials from garmin.config.json or uses supplied params
    // Pass credentials explicitly to `login` to demonstrate that API form
    await GCClient.login(USERNAME, PASSWORD);

    // // Get user info
    // const info = await GCClient.getUserInfo();

    // Log info to make sure signin was successful
    // console.log(info);
    // // Get user settings
    const settings = await GCClient.getUserSettings();

    // Log info to make sure signin was successful
    console.log(settings);
};

// Run the code
main();
