/**
 * Example: Fetch Health Data (Weight & Heart Rate)
 *
 * This example demonstrates how to fetch weight and heart rate data
 * for specific dates using the Garmin Connect API.
 */

const { GarminConnect } = require('..');
const {
    username: USERNAME,
    password: PASSWORD
} = require('../config/load-config');

const main = async () => {
    console.log('🏥 Garmin Health Data Example\n');

    // Initialize client and login
    const GCClient = new GarminConnect({
        username: USERNAME,
        password: PASSWORD
    });
    console.log('🔐 Logging in...');
    await GCClient.login();
    console.log('✅ Login successful!\n');

    // Get today's date and a few days back
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    console.log('📊 Fetching health data...\n');

    // --- Weight Data ---
    console.log('⚖️  Weight Data:');
    console.log('═══════════════════════════════════════\n');

    try {
        // Fetch weight for today
        const weightToday = await GCClient.getWeight(today);
        if (weightToday) {
            console.log(`📅 Today (${weightToday.calendarDate}):`);
            console.log(`   Weight: ${weightToday.weight} kg`);
            if (weightToday.bmi !== null) {
                console.log(`   BMI: ${weightToday.bmi}`);
            }
            if (weightToday.bodyFat !== null) {
                console.log(`   Body Fat: ${weightToday.bodyFat}%`);
            }
            if (weightToday.muscleMass !== null) {
                console.log(`   Muscle Mass: ${weightToday.muscleMass} kg`);
            }
            console.log('');
        } else {
            console.log('📅 Today: No weight data recorded\n');
        }

        // Fetch weight for yesterday
        const weightYesterday = await GCClient.getWeight(yesterday);
        if (weightYesterday) {
            console.log(`📅 Yesterday (${weightYesterday.calendarDate}):`);
            console.log(`   Weight: ${weightYesterday.weight} kg`);
            if (weightYesterday.weightDelta !== 0) {
                const delta = weightYesterday.weightDelta > 0 ? '+' : '';
                console.log(
                    `   Change: ${delta}${weightYesterday.weightDelta} kg`
                );
            }
            console.log('');
        } else {
            console.log('📅 Yesterday: No weight data recorded\n');
        }

        // Fetch weight for last week
        const weightLastWeek = await GCClient.getWeight(lastWeek);
        if (weightLastWeek) {
            console.log(`📅 Last Week (${weightLastWeek.calendarDate}):`);
            console.log(`   Weight: ${weightLastWeek.weight} kg`);
            console.log('');
        }
    } catch (error) {
        console.error('❌ Error fetching weight data:', error.message);
    }

    // --- Heart Rate Data ---
    console.log('\n❤️  Heart Rate Data:');
    console.log('═══════════════════════════════════════\n');

    try {
        // Fetch heart rate for today
        const hrToday = await GCClient.getHeartRate(today);
        console.log(`📅 Today (${hrToday.calendarDate}):`);
        console.log(`   Resting HR: ${hrToday.restingHeartRate} bpm`);
        console.log(`   Min HR: ${hrToday.minHeartRate} bpm`);
        console.log(`   Max HR: ${hrToday.maxHeartRate} bpm`);
        console.log(
            `   7-Day Avg Resting HR: ${hrToday.lastSevenDaysAvgRestingHeartRate} bpm`
        );

        // Show number of heart rate measurements
        if (hrToday.heartRateValues && hrToday.heartRateValues.length > 0) {
            const totalMeasurements = hrToday.heartRateValues.reduce(
                (sum, arr) => sum + arr.length,
                0
            );
            console.log(`   Total measurements: ${totalMeasurements}`);

            // Show first few measurements if available
            if (hrToday.heartRateValues[0].length > 0) {
                console.log('\n   Sample measurements:');
                const samples = hrToday.heartRateValues[0].slice(0, 3);
                samples.forEach((entry) => {
                    if (entry && entry.timestamp && entry.heartrate) {
                        const time = new Date(entry.timestamp);
                        console.log(
                            `     ${time.toLocaleTimeString()}: ${
                                entry.heartrate
                            } bpm`
                        );
                    }
                });
            }
        } else {
            console.log('   No detailed measurements available');
        }
        console.log('');

        // Fetch heart rate for yesterday
        const hrYesterday = await GCClient.getHeartRate(yesterday);
        console.log(`📅 Yesterday (${hrYesterday.calendarDate}):`);
        console.log(`   Resting HR: ${hrYesterday.restingHeartRate} bpm`);
        console.log(`   Min HR: ${hrYesterday.minHeartRate} bpm`);
        console.log(`   Max HR: ${hrYesterday.maxHeartRate} bpm`);
        console.log('');
    } catch (error) {
        console.error('❌ Error fetching heart rate data:', error.message);
    }

    console.log('\n✅ Health data fetch completed!');
};

main().catch((err) => {
    console.error('\n❌ Fatal error:', err);
    process.exit(1);
});
