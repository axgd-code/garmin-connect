export interface DailyStressValues {
    highStressDuration: number;
    lowStressDuration: number;
    overallStressLevel: number;
    restStressDuration: number;
    mediumStressDuration: number;
}

export interface DailyStressStats {
    calendarDate: string;
    values: DailyStressValues;
}

export type DailyStressReading = [timestamp: number, stressLevel: number];

export type BodyBatteryReading = [
    timestamp: number,
    status: string,
    level: number,
    version: number
];

export interface DailyBodyBatteryStress {
    userProfilePK: number;
    calendarDate: string;
    startTimestampGMT: string;
    endTimestampGMT: string;
    startTimestampLocal: string;
    endTimestampLocal: string;
    maxStressLevel: number;
    avgStressLevel: number;
    stressChartValueOffset: number;
    stressChartYAxisOrigin: number;
    stressValuesArray: DailyStressReading[];
    bodyBatteryValuesArray: BodyBatteryReading[];
}
