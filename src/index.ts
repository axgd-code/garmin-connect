export { default as GarminConnect } from './garmin/GarminConnect';

// Export configuration types
export type {
    GCCredentials,
    GarminConnectConfig
} from './garmin/GarminConnect';

export type { HttpClientConfig, TokenPersistence } from './common/HttpClient';

export type { LogLevel } from './common/Logger';

// Export common types
export type {
    ISocialProfile,
    IUserPerformanceMetrics,
    IUserSettings,
    IWorkout,
    IWorkoutDetail,
    IDailyStepsType,
    WeightData
} from './garmin/types';

// Export specific data types
export type { Weight } from './garmin/types/weight';
export type { HeartRate } from './garmin/types/heartrate';
export type { SleepData } from './garmin/types/sleep';
export type { HydrationData } from './garmin/types/hydration';
export type {
    DailyHrvBaseline,
    DailyHrvResponse,
    DailyHrvSummary,
    DailySummary,
    DailyStressStats,
    DailyStressValues,
    DailyStressReading,
    DailyBodyBatteryStress,
    BodyBatteryReading
} from './garmin/types';

// Export activity types
export type {
    IActivity,
    ActivityType,
    ActivitySubType,
    GCActivityId
} from './garmin/types/activity';

// Export enums
export { ExportFileType, UploadFileType } from './garmin/types';

export type {
    ExportFileTypeValue,
    UploadFileTypeTypeValue
} from './garmin/types';
