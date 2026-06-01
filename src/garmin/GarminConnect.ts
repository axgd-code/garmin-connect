// Import Obsidian types only if available
let obsidianApp: any;
let normalizePath: (path: string) => string;

try {
    const obsidian = require('obsidian');
    obsidianApp = obsidian.App;
    normalizePath = obsidian.normalizePath;
} catch (e) {
    // Obsidian not available - provide fallbacks
    obsidianApp = class {};
    normalizePath = (path: string) => path;
}

// Type alias for compatibility
type App = typeof obsidianApp;

import { UrlClass } from './UrlClass';
import {
    HttpClient,
    HttpClientConfig,
    TokenPersistence
} from '../common/HttpClient';
import { Cache } from '../common/Cache';
import {
    DailyHrvResponse,
    DailyHrvSummary,
    ExportFileTypeValue,
    GCUserHash,
    GarminDomain,
    DailyBodyBatteryStress,
    DailySummary,
    DailyStressStats,
    ICountActivities,
    IDailyStepsType,
    IGarminTokens,
    IOauth1Token,
    IOauth2Token,
    ISocialProfile,
    IUserPerformanceMetrics,
    IUserSettings,
    IWorkout,
    IWorkoutDetail,
    UploadFileTypeTypeValue,
    WeightData,
    Weight,
    HeartRate
} from './types';

import Running from './workouts/Running';
import {
    calculateTimeDifference,
    getLocalTimestamp,
    toDateString
} from './common/DateUtils';

import { SleepData } from './types/sleep';
import { gramsToPounds } from './common/WeightUtils';
import { convertMLToOunces, convertOuncesToML } from './common/HydrationUtils';

import {
    ActivitySubType,
    ActivityType,
    GCActivityId,
    IActivity
} from './types/activity';

/* ---------------------------------------------------------
   Types
--------------------------------------------------------- */

export interface GCCredentials {
    username: string;
    password: string;
}

export interface GarminConnectConfig {
    headers?: Record<string, string>;
    httpClientConfig?: HttpClientConfig;
    tokenPersistence?: TokenPersistence;
}

/* ---------------------------------------------------------
   GarminConnect (Mobile-safe)
--------------------------------------------------------- */

export default class GarminConnect {
    private readonly client: HttpClient;
    private readonly url: UrlClass;
    private credentials: GCCredentials;

    // Cache for user profile (5 minutes TTL)
    private profileCache = new Cache<ISocialProfile>(5 * 60 * 1000);

    // Cache for daily data (1 hour TTL) - steps, weight, heart rate, sleep
    // Key format: "type:YYYY-MM-DD"
    private dailyCache = new Cache<any>(60 * 60 * 1000);

    constructor(
        credentials: GCCredentials,
        domain: GarminDomain = 'garmin.com',
        config?: GarminConnectConfig
    ) {
        if (!credentials) throw new Error('Missing credentials');

        this.credentials = credentials;
        this.url = new UrlClass(domain);
        this.client = new HttpClient(this.url, {
            ...config?.httpClientConfig,
            tokenPersistence: config?.tokenPersistence
        });
        if (config?.headers) {
            this.client.setCommonHeader(config.headers);
        }
    }

    /* ----------------------------------------------------- */
    async login(): Promise<this> {
        await this.client.login(
            this.credentials.username,
            this.credentials.password
        );
        this.profileCache.clear();
        return this;
    }

    /* ----------------------------------------------------- */
    async exportTokenToVault(app: App, dir: string): Promise<void> {
        const base = normalizePath(dir);
        const vault = app.vault;

        if (!(await vault.adapter.exists(base))) {
            await vault.createFolder(base);
        }

        if (this.client.oauth1Token) {
            await vault.adapter.write(
                `${base}/oauth1_token.json`,
                JSON.stringify(this.client.oauth1Token, null, 2)
            );
        }

        if (this.client.oauth2Token) {
            await vault.adapter.write(
                `${base}/oauth2_token.json`,
                JSON.stringify(this.client.oauth2Token, null, 2)
            );
        }
    }

    async loadTokenFromVault(app: App, dir: string): Promise<void> {
        const base = normalizePath(dir);
        const vault = app.vault;

        const oauth1 = `${base}/oauth1_token.json`;
        const oauth2 = `${base}/oauth2_token.json`;

        if (await vault.adapter.exists(oauth1)) {
            this.client.oauth1Token = JSON.parse(
                await vault.adapter.read(oauth1)
            );
        }

        if (await vault.adapter.exists(oauth2)) {
            this.client.oauth2Token = JSON.parse(
                await vault.adapter.read(oauth2)
            );
        }

        if (!this.client.oauth1Token && !this.client.oauth2Token) {
            throw new Error('No token found');
        }
    }

    exportToken(): IGarminTokens {
        if (!this.client.oauth1Token || !this.client.oauth2Token) {
            throw new Error('Missing tokens');
        }
        return {
            oauth1: this.client.oauth1Token,
            oauth2: this.client.oauth2Token
        };
    }

    /* ----------------------------------------------------- */
    async getUserProfile(force = false): Promise<ISocialProfile> {
        if (!force) {
            const cached = this.profileCache.get('profile');
            if (cached) {
                return cached;
            }
        }

        const profile = await this.client.get<ISocialProfile>(
            this.url.USER_PROFILE
        );

        this.profileCache.set('profile', profile);
        return profile;
    }

    async getUserSettings(): Promise<IUserSettings> {
        return this.client.get<IUserSettings>(this.url.USER_SETTINGS);
    }

    async getUserPerformanceMetrics(): Promise<IUserPerformanceMetrics> {
        const { userData } = await this.getUserSettings();

        return {
            activityLevel: userData.activityLevel,
            lactateThresholdHeartRate: userData.lactateThresholdHeartRate,
            lactateThresholdHeartRateCycling:
                userData.lactateThresholdHeartRateCycling,
            lactateThresholdHeartRateRowing:
                userData.lactateThresholdHeartRateRowing,
            lactateThresholdRowingPace: userData.lactateThresholdRowingPace,
            lactateThresholdSpeed: userData.lactateThresholdSpeed,
            moderateIntensityMinutesHrZone:
                userData.moderateIntensityMinutesHrZone,
            thresholdHeartRateAutoDetected:
                userData.thresholdHeartRateAutoDetected,
            vigorousIntensityMinutesHrZone:
                userData.vigorousIntensityMinutesHrZone,
            vo2MaxCycling: userData.vo2MaxCycling,
            vo2MaxRunning: userData.vo2MaxRunning,
            weight: userData.weight
        };
    }

    async getActivities(
        start = 0,
        limit = 20,
        activityType?: ActivityType,
        subActivityType?: ActivitySubType
    ): Promise<IActivity[]> {
        return this.client.get<IActivity[]>(this.url.ACTIVITIES, {
            params: { start, limit, activityType, subActivityType }
        });
    }

    async getSteps(date = new Date()): Promise<number> {
        const d = toDateString(date);
        const cacheKey = `steps:${d}`;

        // Check cache first
        const cached = this.dailyCache.get(cacheKey);
        if (cached !== undefined) {
            return cached;
        }

        const days = await this.client.get<IDailyStepsType[]>(
            `${this.url.DAILY_STEPS}${d}/${d}`
        );

        const day = days.find((x) => x.calendarDate === d);
        if (!day) throw new Error('No steps');

        // Cache the result
        this.dailyCache.set(cacheKey, day.totalSteps);

        return day.totalSteps;
    }

    async getDailySummary(date = new Date()): Promise<DailySummary> {
        const d = toDateString(date);
        const cacheKey = `summary:${d}`;

        const cached = this.dailyCache.get(cacheKey);
        if (cached !== undefined) {
            return cached;
        }

        const profile = await this.getUserProfile();
        const summary = await this.client.get<DailySummary>(
            `${this.url.DAILY_SUMMARY}/${profile.displayName}`,
            { params: { calendarDate: d } }
        );

        this.dailyCache.set(cacheKey, summary);

        return summary;
    }

    async getSleep(date = new Date()): Promise<SleepData> {
        const d = toDateString(date);
        const cacheKey = `sleep:${d}`;

        // Check cache first
        const cached = this.dailyCache.get(cacheKey);
        if (cached !== undefined) {
            return cached;
        }

        const sleepData = await this.client.get<SleepData>(
            this.url.DAILY_SLEEP,
            { params: { date: d } }
        );

        // Cache the result
        this.dailyCache.set(cacheKey, sleepData);

        return sleepData;
    }

    async getSleepDuration(date = new Date()) {
        const sleep = await this.getSleep(date);
        return calculateTimeDifference(
            sleep.dailySleepDTO.sleepStartTimestampGMT,
            sleep.dailySleepDTO.sleepEndTimestampGMT
        );
    }

    async updateHydrationLogOunces(date: Date, oz: number) {
        const profile = await this.getUserProfile();

        return this.client.put(this.url.HYDRATION_LOG, {
            calendarDate: toDateString(date),
            valueInML: convertOuncesToML(oz),
            userProfileId: profile.profileId,
            timestampLocal: date.toISOString().substring(0, 23)
        });
    }

    async getWeight(date = new Date()): Promise<Weight | null> {
        const d = toDateString(date);
        const cacheKey = `weight:${d}`;

        // Check cache first
        const cached = this.dailyCache.get(cacheKey);
        if (cached !== undefined) {
            return cached;
        }

        const data = await this.client.get<WeightData>(
            `${this.url.DAILY_WEIGHT}/${d}`
        );

        let result: Weight | null = null;
        const weight = data.dateWeightList?.find((x) => x.calendarDate === d);

        if (weight) {
            // Convert weight from grams to kg
            result = {
                ...weight,
                weight: weight.weight / 1000
            };
        } else if (data.dateWeightList && data.dateWeightList.length > 0) {
            const firstWeight = data.dateWeightList[0];
            // Convert weight from grams to kg
            result = {
                ...firstWeight,
                weight: firstWeight.weight / 1000
            };
        }

        // Cache the result (even if null to avoid repeated failed requests)
        this.dailyCache.set(cacheKey, result);

        return result;
    }

    async getHeartRate(date = new Date()): Promise<HeartRate> {
        const d = toDateString(date);
        const cacheKey = `heartrate:${d}`;

        // Check cache first
        const cached = this.dailyCache.get(cacheKey);
        if (cached) {
            return cached;
        }

        const heartRate = await this.client.get<HeartRate>(
            this.url.DAILY_HEART_RATE,
            {
                params: { date: d }
            }
        );

        // Cache the result
        this.dailyCache.set(cacheKey, heartRate);

        return heartRate;
    }

    async getDailyStress(date = new Date()): Promise<DailyStressStats> {
        const d = toDateString(date);
        const cacheKey = `stress:${d}`;

        const cached = this.dailyCache.get(cacheKey);
        if (cached !== undefined) {
            return cached;
        }

        const days = await this.client.get<DailyStressStats[]>(
            `${this.url.DAILY_STRESS}${d}/${d}`
        );

        const day = days.find((x) => x.calendarDate === d);
        if (!day) throw new Error('No stress data');

        this.dailyCache.set(cacheKey, day);

        return day;
    }

    async getDailyBodyBatteryStress(
        date = new Date()
    ): Promise<DailyBodyBatteryStress> {
        const d = toDateString(date);
        const cacheKey = `bodyBatteryStress:${d}`;

        const cached = this.dailyCache.get(cacheKey);
        if (cached !== undefined) {
            return cached;
        }

        const stressData = await this.client.get<DailyBodyBatteryStress>(
            `${this.url.DAILY_BODY_BATTERY_STRESS}/${d}`
        );

        this.dailyCache.set(cacheKey, stressData);

        return stressData;
    }

    async getDailyHrv(date = new Date()): Promise<DailyHrvSummary> {
        const d = toDateString(date);
        const cacheKey = `hrv:${d}`;

        const cached = this.dailyCache.get(cacheKey);
        if (cached !== undefined) {
            return cached;
        }

        const response = await this.client.get<DailyHrvResponse>(
            `${this.url.DAILY_HRV}${d}/${d}`
        );

        const summary =
            response.hrvSummaries?.find((x) => x.calendarDate === d) ||
            response.hrvSummaries?.[0];

        if (!summary) throw new Error('No HRV data');

        this.dailyCache.set(cacheKey, summary);

        return summary;
    }

    /* ----------------------------------------------------- */
    async uploadActivity(): Promise<never> {
        throw new Error('uploadActivity is not supported on mobile');
    }

    async downloadOriginalActivityData(): Promise<never> {
        throw new Error(
            'downloadOriginalActivityData is not supported on mobile'
        );
    }
}
