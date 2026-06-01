/**
 * Test 5: Real API Integration Test
 *
 * This test connects to the real Garmin API using credentials from local-config.json
 * and verifies that the API returns valid data.
 *
 * To run this test:
 * 1. Copy config/local-config.example.json to config/local-config.json
 * 2. Add your real Garmin credentials
 * 3. Run: npm run test:real-api
 */

import GarminConnect from '../src/garmin/GarminConnect';
import {
    DailyBodyBatteryStress,
    DailyHrvSummary,
    DailySummary,
    DailyStressStats,
    HeartRate,
    Weight
} from '../src/garmin/types';
import { SleepData } from '../src/garmin/types/sleep';
import * as fs from 'fs';
import * as path from 'path';

async function runRealApiTest() {
    console.log('\n📋 Test 5: Real API Integration Test\n');

    // Load credentials from local-config.json
    const configPath = path.join(__dirname, '../config/local-config.json');

    if (!fs.existsSync(configPath)) {
        console.log('  ⚠️  local-config.json not found');
        console.log(
            '  ℹ️  Copy config/local-config.example.json to config/local-config.json'
        );
        console.log('  ℹ️  And add your Garmin credentials');
        console.log('\n  ⏭️  Skipping real API test\n');
        return true;
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    if (
        !config.username ||
        !config.password ||
        config.username.includes('example')
    ) {
        console.log(
            '  ⚠️  Please set real credentials in config/local-config.json'
        );
        console.log('  ⏭️  Skipping real API test\n');
        return true;
    }

    console.log('  5.1: Connecting to Garmin API');
    console.log(`       Username: ${config.username.substring(0, 3)}***`);

    // Configure log level: 'silent' | 'error' | 'warn' | 'info' | 'debug'
    // Default is 'error' (only errors are logged)
    // Use 'silent' for tests to avoid console pollution
    const client = new GarminConnect(
        {
            username: config.username,
            password: config.password
        },
        'garmin.com',
        {
            httpClientConfig: {
                logLevel: 'silent' // Suppress all logs in tests
            }
        }
    );

    try {
        // Test 5.1: Login
        console.log('\n  🔐 Logging in...');
        await client.login();
        console.log('    ✅ Login successful');

        // Test 5.2: Get user profile
        console.log('\n  👤 Getting user profile...');
        const profile = await client.getUserProfile();
        console.log('    ✅ Profile retrieved:');
        console.log(`       Name: ${profile.displayName || 'N/A'}`);
        console.log(`       Profile ID: ${profile.profileId}`);

        // Test 5.3: Get today's steps
        console.log("\n  👟 Getting today's steps...");
        const today = new Date();
        try {
            const steps = await client.getSteps(today);
            console.log('    ✅ Steps retrieved:', steps);
        } catch (e) {
            console.log(
                '    ⚠️  No steps data for today:',
                (e as Error).message
            );
        }

        // Test 5.4: Get today's weight
        console.log("\n  ⚖️  Getting today's weight...");
        try {
            const weight = await client.getWeight(today);
            if (weight) {
                console.log('    ✅ Weight retrieved:');
                console.log(
                    '       Raw data:',
                    JSON.stringify(weight, null, 2)
                );
                console.log(`       Weight: ${weight.weight} kg`);
                console.log(`       BMI: ${weight.bmi}`);
                console.log(`       Body Fat: ${weight.bodyFat}%`);
                console.log(`       Date: ${weight.calendarDate}`);
            } else {
                console.log('    ℹ️  No weight data for today');

                // Try to get weight from yesterday or last 7 days
                console.log('\n  ⚖️  Checking last 7 days for weight data...');
                let foundWeight = false;
                for (let i = 1; i <= 7; i++) {
                    const pastDate = new Date(today);
                    pastDate.setDate(pastDate.getDate() - i);
                    const pastWeight = await client.getWeight(pastDate);
                    if (pastWeight) {
                        console.log(
                            `    ✅ Found weight from ${i} day(s) ago:`
                        );
                        console.log(
                            '       Raw data:',
                            JSON.stringify(pastWeight, null, 2)
                        );
                        console.log(`       Weight: ${pastWeight.weight} kg`);
                        console.log(`       Date: ${pastWeight.calendarDate}`);
                        foundWeight = true;
                        break;
                    }
                }
                if (!foundWeight) {
                    console.log(
                        '    ⚠️  No weight data found in the last 7 days'
                    );
                }
            }
        } catch (e) {
            console.log('    ❌ Error getting weight:', (e as Error).message);
            console.log('       Stack:', (e as Error).stack);
        }

        // Test 5.5: Get today's heart rate
        console.log("\n  ❤️  Getting today's heart rate...");
        try {
            const heartRate = await client.getHeartRate(today);
            console.log('    ✅ Heart rate retrieved:');
            console.log(
                `       Resting: ${heartRate.restingHeartRate || 'N/A'} bpm`
            );
            console.log(`       Max: ${heartRate.maxHeartRate || 'N/A'} bpm`);
            console.log(`       Min: ${heartRate.minHeartRate || 'N/A'} bpm`);
        } catch (e) {
            console.log('    ⚠️  No heart rate data:', (e as Error).message);
        }

        // Test 5.6: Get today's sleep
        console.log("\n  🛏️  Getting today's sleep...");
        try {
            const sleep = await client.getSleep(today);
            console.log('    ✅ Sleep retrieved:');
            console.log(
                `       Sleep score: ${
                    sleep.dailySleepDTO?.sleepScores?.overall?.value || 'N/A'
                }`
            );
            console.log(
                `       Total sleep: ${
                    sleep.dailySleepDTO?.sleepTimeSeconds
                        ? Math.round(sleep.dailySleepDTO.sleepTimeSeconds / 60)
                        : 'N/A'
                } minutes`
            );
        } catch (e) {
            console.log('    ⚠️  No sleep data:', (e as Error).message);
        }

        // Test 5.7: Get today's daily stress aggregate
        console.log("\n  😰 Getting today's daily stress...");
        try {
            const stress: DailyStressStats = await client.getDailyStress(today);
            console.log('    ✅ Daily stress retrieved:');
            console.log(
                `       Overall stress: ${stress.values.overallStressLevel}`
            );
            console.log(
                `       Rest duration: ${stress.values.restStressDuration}s`
            );
            console.log(
                `       Low/Medium/High: ${stress.values.lowStressDuration}/${stress.values.mediumStressDuration}/${stress.values.highStressDuration}`
            );
        } catch (e) {
            console.log('    ⚠️  No daily stress data:', (e as Error).message);
        }

        // Test 5.8: Get today's detailed stress + Body Battery
        console.log("\n  🔋 Getting today's body battery stress detail...");
        try {
            const detail: DailyBodyBatteryStress =
                await client.getDailyBodyBatteryStress(today);
            console.log('    ✅ Body Battery stress detail retrieved:');
            console.log(`       Avg stress: ${detail.avgStressLevel}`);
            console.log(`       Max stress: ${detail.maxStressLevel}`);
            console.log(
                `       Stress samples: ${detail.stressValuesArray.length}`
            );
            console.log(
                `       Body Battery samples: ${detail.bodyBatteryValuesArray.length}`
            );
        } catch (e) {
            console.log(
                '    ⚠️  No body battery stress detail:',
                (e as Error).message
            );
        }

        // Test 5.9: Get today's daily summary
        console.log("\n  📘 Getting today's daily summary...");
        try {
            const summary: DailySummary = await client.getDailySummary(today);
            console.log('    ✅ Daily summary retrieved:');
            console.log(`       Steps: ${summary.totalSteps ?? 'N/A'}`);
            console.log(
                `       Resting HR: ${summary.restingHeartRate ?? 'N/A'} bpm`
            );
            console.log(
                `       Avg/Max stress: ${
                    summary.averageStressLevel ?? 'N/A'
                }/${summary.maxStressLevel ?? 'N/A'}`
            );
        } catch (e) {
            console.log('    ⚠️  No daily summary data:', (e as Error).message);
        }

        // Test 5.10: Get today's daily HRV summary
        console.log("\n  🧬 Getting today's daily HRV summary...");
        try {
            const hrv: DailyHrvSummary = await client.getDailyHrv(today);
            console.log('    ✅ Daily HRV retrieved:');
            console.log(`       Weekly avg: ${hrv.weeklyAvg ?? 'N/A'}`);
            console.log(`       Last night avg: ${hrv.lastNightAvg ?? 'N/A'}`);
            console.log(`       Status: ${hrv.status}`);
        } catch (e) {
            console.log('    ⚠️  No daily HRV data:', (e as Error).message);
        }

        console.log('\n  ✅ Test 5 PASSED\n');
        return true;
    } catch (error) {
        console.error('\n  ❌ Test 5 FAILED');
        console.error('     Error:', (error as Error).message);
        if ((error as Error).stack) {
            console.error('     Stack:', (error as Error).stack);
        }
        return false;
    }
}

// Run the test
runRealApiTest()
    .then((success) => {
        process.exit(success ? 0 : 1);
    })
    .catch((error) => {
        console.error('Unexpected error:', error);
        process.exit(1);
    });
