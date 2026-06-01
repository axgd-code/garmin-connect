/**
 * Test 6: Daily Stress, Summary and HRV
 * Verifies type availability, method wiring, endpoint configuration, and cache behavior.
 */

import GarminConnect from '../src/garmin/GarminConnect';
import {
    DailyBodyBatteryStress,
    DailyHrvSummary,
    DailySummary,
    DailyStressStats
} from '../src/garmin/types';
import { UrlClass } from '../src/garmin/UrlClass';

console.log('\n📋 Test 6: Daily Stress, Summary and HRV\n');

async function main() {
    // Test 6.1: Verify type imports
    console.log('  6.1: Type imports');
    console.log('    ✓ DailyStressStats');
    console.log('    ✓ DailyBodyBatteryStress');
    console.log('    ✓ DailySummary');
    console.log('    ✓ DailyHrvSummary');
    console.log('    ✅ Daily data types imported successfully\n');

    // Test 6.2: Verify structure compatibility
    console.log('  6.2: Type structure');
    const mockDailyStress: DailyStressStats = {
        calendarDate: '2026-06-01',
        values: {
            highStressDuration: 240,
            lowStressDuration: 11460,
            overallStressLevel: 23,
            restStressDuration: 18420,
            mediumStressDuration: 960
        }
    };
    const mockBodyBatteryStress: DailyBodyBatteryStress = {
        userProfilePK: 123456,
        calendarDate: '2026-06-01',
        startTimestampGMT: '2026-05-31T22:00:00.0',
        endTimestampGMT: '2026-06-01T21:59:59.0',
        startTimestampLocal: '2026-06-01T00:00:00.0',
        endTimestampLocal: '2026-06-01T23:59:59.0',
        maxStressLevel: 93,
        avgStressLevel: 23,
        stressChartValueOffset: 0,
        stressChartYAxisOrigin: 0,
        stressValuesArray: [
            [1748815200000, 12],
            [1748815500000, 18]
        ],
        bodyBatteryValuesArray: [
            [1748815200000, 'charging', 45, 1],
            [1748815500000, 'draining', 44, 1]
        ]
    };
    const mockSummary: DailySummary = {
        userProfileId: 123456,
        calendarDate: '2026-06-01',
        totalSteps: 12034,
        restingHeartRate: 48,
        averageStressLevel: 23,
        maxStressLevel: 93,
        bodyBatteryHighestValue: 76,
        bodyBatteryLowestValue: 33
    };
    const mockHrv: DailyHrvSummary = {
        calendarDate: '2026-06-01',
        weeklyAvg: 51,
        lastNightAvg: 48,
        lastNight5MinHigh: 69,
        baseline: {
            lowUpper: 36,
            balancedLow: 39,
            balancedUpper: 52,
            markerValue: 0.25
        },
        status: 'BALANCED',
        feedbackPhrase: 'HRV_BALANCED_7',
        createTimeStamp: '2026-06-01T12:14:11.898Z'
    };
    console.log('    ✅ Stress structure valid:', mockDailyStress.values);
    console.log('    ✅ Body Battery structure valid:', {
        avgStressLevel: mockBodyBatteryStress.avgStressLevel,
        points: mockBodyBatteryStress.stressValuesArray.length,
        batteryPoints: mockBodyBatteryStress.bodyBatteryValuesArray.length
    }, '\n');
    console.log('    ✅ Daily summary structure valid:', {
        steps: mockSummary.totalSteps,
        avgStressLevel: mockSummary.averageStressLevel,
        maxStressLevel: mockSummary.maxStressLevel
    });
    console.log('    ✅ Daily HRV structure valid:', {
        weeklyAvg: mockHrv.weeklyAvg,
        lastNightAvg: mockHrv.lastNightAvg,
        status: mockHrv.status
    }, '\n');

    // Test 6.3: GarminConnect instance has new methods
    console.log('  6.3: GarminConnect method availability');
    const gcClient = new GarminConnect({
        username: 'test@example.com',
        password: 'test123'
    });

    if (typeof gcClient.getDailyStress !== 'function') {
        throw new Error('getDailyStress method not found');
    }
    console.log('    ✓ getDailyStress() method exists');

    if (typeof gcClient.getDailyBodyBatteryStress !== 'function') {
        throw new Error('getDailyBodyBatteryStress method not found');
    }
    console.log('    ✓ getDailyBodyBatteryStress() method exists');
    if (typeof gcClient.getDailySummary !== 'function') {
        throw new Error('getDailySummary method not found');
    }
    console.log('    ✓ getDailySummary() method exists');
    if (typeof gcClient.getDailyHrv !== 'function') {
        throw new Error('getDailyHrv method not found');
    }
    console.log('    ✓ getDailyHrv() method exists');
    console.log('    ✅ Daily methods available\n');

    // Test 6.4: URL endpoints
    console.log('  6.4: URL endpoint configuration');
    const url = new UrlClass();
    if (!url.DAILY_STRESS) {
        throw new Error('DAILY_STRESS URL not found');
    }
    console.log('    ✓ DAILY_STRESS:', url.DAILY_STRESS);

    if (!url.DAILY_BODY_BATTERY_STRESS) {
        throw new Error('DAILY_BODY_BATTERY_STRESS URL not found');
    }
    console.log(
        '    ✓ DAILY_BODY_BATTERY_STRESS:',
        url.DAILY_BODY_BATTERY_STRESS
    );
    if (!url.DAILY_SUMMARY) {
        throw new Error('DAILY_SUMMARY URL not found');
    }
    console.log('    ✓ DAILY_SUMMARY:', url.DAILY_SUMMARY);
    if (!url.DAILY_HRV) {
        throw new Error('DAILY_HRV URL not found');
    }
    console.log('    ✓ DAILY_HRV:', url.DAILY_HRV);
    console.log('    ✅ Daily endpoints configured correctly\n');

    // Test 6.5: Method wiring and cache behavior
    console.log('  6.5: Method wiring and cache behavior');
    const internalClient = (gcClient as any).client;
    const calls: string[] = [];
    internalClient.get = async (requestUrl: string) => {
        calls.push(requestUrl);
        if (requestUrl.includes('/usersummary-service/stats/stress/daily/')) {
            return [mockDailyStress];
        }
        if (requestUrl.includes('/wellness-service/wellness/dailyStress/')) {
            return mockBodyBatteryStress;
        }
        if (requestUrl.includes('/usersummary-service/usersummary/daily/')) {
            return mockSummary;
        }
        if (requestUrl.includes('/hrv-service/hrv/daily/')) {
            return { hrvSummaries: [mockHrv] };
        }
        throw new Error(`Unexpected URL: ${requestUrl}`);
    };
    (gcClient as any).getUserProfile = async () => ({
        displayName: 'test-display-name'
    });

    const date = new Date('2026-06-01T12:00:00.000Z');
    const stress1 = await gcClient.getDailyStress(date);
    const stress2 = await gcClient.getDailyStress(date);
    const body1 = await gcClient.getDailyBodyBatteryStress(date);
    const body2 = await gcClient.getDailyBodyBatteryStress(date);
    const summary1 = await gcClient.getDailySummary(date);
    const summary2 = await gcClient.getDailySummary(date);
    const hrv1 = await gcClient.getDailyHrv(date);
    const hrv2 = await gcClient.getDailyHrv(date);

    if (stress1.values.overallStressLevel !== 23 || stress2 !== stress1) {
        throw new Error('getDailyStress returned unexpected data');
    }
    if (body1.avgStressLevel !== 23 || body2 !== body1) {
        throw new Error('getDailyBodyBatteryStress returned unexpected data');
    }
    if (summary1.totalSteps !== 12034 || summary2 !== summary1) {
        throw new Error('getDailySummary returned unexpected data');
    }
    if (hrv1.lastNightAvg !== 48 || hrv2 !== hrv1) {
        throw new Error('getDailyHrv returned unexpected data');
    }

    const stressCalls = calls.filter((x) => x.includes('/stats/stress/daily/'));
    const bodyCalls = calls.filter((x) => x.includes('/wellness/dailyStress/'));
    const summaryCalls = calls.filter((x) =>
        x.includes('/usersummary-service/usersummary/daily/')
    );
    const hrvCalls = calls.filter((x) => x.includes('/hrv-service/hrv/daily/'));

    if (stressCalls.length !== 1) {
        throw new Error(`Expected 1 stress request, got ${stressCalls.length}`);
    }
    if (bodyCalls.length !== 1) {
        throw new Error(
            `Expected 1 body battery stress request, got ${bodyCalls.length}`
        );
    }
    if (summaryCalls.length !== 1) {
        throw new Error(`Expected 1 summary request, got ${summaryCalls.length}`);
    }
    if (hrvCalls.length !== 1) {
        throw new Error(`Expected 1 hrv request, got ${hrvCalls.length}`);
    }

    console.log('    ✓ Stress request is cached after first fetch');
    console.log('    ✓ Body Battery stress request is cached after first fetch');
    console.log('    ✓ Daily summary request is cached after first fetch');
    console.log('    ✓ Daily HRV request is cached after first fetch');
    console.log('    ✅ Method wiring verified\n');

    console.log('  ✅ Test 6 PASSED\n');
}

main().catch((error) => {
    console.error(
        '  ❌ Test 6 FAILED:',
        error instanceof Error ? error.message : error
    );
    process.exit(1);
});