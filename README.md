# garmin-connect-obsidian

## v1.6.0 refactor

TODO:

-   [x] New HttpClient class
-   [x] Login and get user token
-   [x] Garmin URLs works with `garmin.cn` and `garmin.com`
-   [x] Auto refresh Ouath2 token
-   [x] Oauth1, Oauth2 token import and export.
-   [x] Download Activity, countActivities, getActivities, getActivity, getUserProfile, getUserSettings
-   [x] Upload Activity, delete Activity
-   [ ] Implementation of other methods, such as Badge, Workout, Gear etc
-   [ ] Handle MFA
-   [x] Handle Account locked
-   [ ] Unit test
-   [ ] Listeners

If something is not working, please check [https://connect.garmin.com/status/](https://connect.garmin.com/status/) first.

Currently, most of previous features are working, but some of Rest API are not added, such as `Gear`,`Workout`,`Badge` etc. So if you need these features, please add a PR.

All of above work inspired by [https://github.com/matin/garth](https://github.com/matin/garth). Many thanks.

---

A powerful JavaScript library for connecting to Garmin Connect for sending and receiving health and workout data. It comes with some predefined methods to get and set different kinds of data for your Garmin account, but also have the possibility to make [custom requests](#custom-requests) `GET`, `POST` and `PUT` are currently supported. This makes it easy to implement whatever may be missing to suite your needs.

## Notes About This Fork (Obsidian Focus)

This fork adds an Obsidian-specific compatibility layer (desktop + mobile) while remaining usable in standard Node.js environments.

Main differences compared to upstream:

-   Obsidian-adapted HTTP transport: uses `requestUrl` when Obsidian is available, with a Node.js `fetch` fallback.
-   Manual cookie management (cookie jar): required because Obsidian HTTP calls are stateless.
-   Plugin/mobile-oriented token persistence:
    -   supports a global store (`globalThis.__GarminTokenStore`) for plugins,
    -   supports an async adapter (`tokenPersistence`) so you can plug in your own storage,
    -   keeps `tokenFilePath` only for backward compatibility and marks it as deprecated in Obsidian/mobile environments.
-   Robust rate-limit handling (HTTP 429): exponential retry + `Retry-After` header support.
-   Configurable structured logging (`silent`, `error`, `warn`, `info`, `debug`) to simplify debugging inside Obsidian plugins.
-   Safer response parsing: protected JSON access + text/HTML fallback to avoid crashes on non-JSON responses.

## Why It Works Better With Obsidian

Inside an Obsidian plugin, runtime constraints differ from a standard Node.js script. This fork works better in that context for 4 practical reasons:

1. Reliable HTTP session handling without a full browser

The client explicitly rebuilds and injects cookies between requests. Without this, the Garmin authentication flow is unstable in a stateless environment.

2. Plugin-friendly session persistence

OAuth tokens can be loaded/saved through a plugin store or a persistence adapter, which avoids frequent re-logins and significantly reduces 429 errors.

3. Compatibility with Obsidian/Electron specifics

The code handles runtime-specific behavior (for example: potentially merged `set-cookie`, fragile JSON parsing, HTML responses), making auth flows more resilient.

4. Easier real-world debugging

Log levels make it easier to diagnose SSO/OAuth issues, 429 retries, and token persistence behavior directly in the Obsidian environment.

If your main target is an Obsidian plugin (especially mobile), this fork is better suited than an implementation designed only for Node.js.

## Prerequisites

This library will require you to add a configuration file to your project root called `garmin.config.json` containing your username and password for the Garmin Connect service.

```json
{
    "username": "my.email@example.com",
    "password": "MySecretPassword"
}
```

## How to install

```shell
$ npm install garmin-connect-obsidian
```

## How to use

```js
const { GarminConnect } = require('garmin-connect-obsidian');
// Create a new Garmin Connect Client
const GCClient = new GarminConnect({
    username: 'my.email@example.com',
    password: 'MySecretPassword'
});
// Uses credentials from garmin.config.json or uses supplied params
await GCClient.login();
const userProfile = await GCClient.getUserProfile();
```

Now you can check `userProfile.userName` to verify that your login was successful.

### Configuration Options (v1.6.0+)

You can customize HTTP client behavior to reduce rate limiting and optimize token reuse:

```js
const GCClient = new GarminConnect(
    {
        username: 'my.email@example.com',
        password: 'MySecretPassword'
    },
    'garmin.com',
    {
        httpClientConfig: {
            maxRetries: 5, // Number of retries on 429 (default: 5)
            tokenFilePath: '/custom/path/to/garmin.tokens.json' // Custom token storage location
        }
    }
);

await GCClient.login();
```

**Token Persistence (Automatic)**

By default, OAuth tokens are automatically saved to `garmin.tokens.json` in your app root after each login. This means:

-   On next initialization, tokens are loaded automatically (avoiding unnecessary re-logins)
-   Token refresh happens automatically before requests if token is expired
-   This drastically reduces HTTP calls and minimizes 429 rate limit errors

To clear persisted tokens (e.g., for testing):

```js
GCClient.client.clearPersistedTokens();
```

**Rate Limiting (HTTP 429)**

If you encounter `HTTP 429: Too Many Requests`:

-   The client automatically retries with exponential backoff (max `maxRetries` attempts)
-   Respects the `Retry-After` header from Garmin servers
-   Tokens are persisted to avoid redundant login requests
-   Consider increasing `maxRetries` if you make many concurrent requests

## Reusing your session(since v1.6.0)

### Save token to file and reuse it.

```js
GCClient.saveTokenToFile('/path/to/save/tokens');
```

Result:

```bash
$ ls /path/to/save/tokens
oauth1_token.json oauth2_token.json
```

Reuse token:

```js
GCClient.loadTokenByFile('/path/to/save/tokens');
```

### Or just save your token to db or other storage.

```js
const oauth1 = GCClient.client.oauth1Token;
const oauth2 = GCClient.client.oauth2Token;
// save to db or other storage
...
```

Reuse token:

```js
GCClient.loadToken(oauth1, oauth2);
```

## Reusing your session(deprecated)

This is an experimental feature and might not yet provide full stability.

After a successful login the `sessionJson` getter and setter can be used to export and restore your session.

```js
// Exporting the session
const session = GCClient.sessionJson;

// Use this instead of GCClient.login() to restore the session
// This will throw an error if the stored session cannot be reused
GCClient.restore(session);
```

The exported session should be serializable and can be stored as a JSON string.

A stored session can only be reused once and will need to be stored after each request. This can be done by attaching some storage to the `sessionChange` event.

```js
GCClient.onSessionChange((session) => {
    /*
        Your choice of storage here
        node-persist will probably work in most cases 
     */
});
```

### Login fallback

To make sure to use a stored session if possible, but fallback to regular login, one can use the `restoreOrLogin` method.
The arguments `username` and `password` are both optional and the regular `.login()` will be
called if session restore fails.

```js
await GCClient.restoreOrLogin(session, username, password);
```

## Events

-   `sessionChange` will trigger on a change in the current `sessionJson`

To attach a listener to an event, use the `.on()` method.

```js
GCClient.on('sessionChange', (session) => console.log(session));
```

There's currently no way of removing listeners.

## Reading data

### User info is not implemented yet. // TODO: Implement this function

Receive basic user information

```js
GCClient.getUserInfo();
```

### Social Profile is not implemented yet. // TODO: Implement this function

Receive social user information

```js
GCClient.getSocialProfile();
```

### Social Connections is not implemented yet. // TODO: Implement this function

Get a list of all social connections

```js
GCClient.getSocialConnections();
```

### Device info is not implemented yet. // TODO: Implement this function

Get a list of all registered devices including model numbers and firmware versions.

```js
GCClient.getDeviceInfo();
```

### `getActivities(start: number, limit: number, activityType?: ActivityType, subActivityType?: ActivitySubType): Promise<IActivity[]>`

Retrieves a list of activities based on specified parameters.

#### Parameters:

-   `start` (number, optonal): Index to start fetching activities.
-   `limit` (number, optonal): Number of activities to retrieve.
-   `activityType` (ActivityType, optional): Type of activity (if specified, start must be null).
-   `subActivityType` (ActivitySubType, optional): Subtype of activity (if specified, start must be null).

#### Returns:

-   `Promise<IActivity[]>`: A Promise that resolves to an array of activities.

#### Example:

```js
const activities = await GCClient.getActivities(
    0,
    10,
    ActivityType.Running,
    ActivitySubType.Outdoor
);
```

### `getActivity(activity: { activityId: GCActivityId }): Promise<IActivity>`

Retrieves details for a specific activity based on the provided `activityId`.

#### Parameters:

-   `activity` (object): An object containing the `activityId` property.

    -   `activityId` (GCActivityId): Identifier for the desired activity.

#### Returns:

-   `Promise<IActivity>`: A Promise that resolves to the details of the specified activity.

#### Example:

```js
const activityDetails = await GCClient.getActivity({
    activityId: 'exampleActivityId'
});
```

### News Feed is not implemented yet. // TODO: Implement this function

To get a list of activities in your news feed, use the `getNewsFeed` method. This function takes two arguments, _start_ and _limit_, which is used for pagination. Both are optional and will default to whatever Garmin Connect is using. To be sure to get all activities, use this correctly.

```js
// Get the news feed with a default length with most recent activities
GCClient.getNewsFeed();
// Get activities in feed, 10 through 15. (start 10, limit 5)
GCClient.getNewsFeed(10, 5);
```

### Download original activity data

Use the activityId to download the original activity data. Usually this is supplied as a .zip file.

```js
const [activity] = await GCClient.getActivities(0, 1);
// Directory path is optional and defaults to the current working directory.
// Downloads filename will be supplied by Garmin.
GCClient.downloadOriginalActivityData(activity, './some/path/that/exists');
```

### Upload activity file

Uploads an activity file as a new Activity. The file can be a `gpx`, `tcx`, or `fit` file. If the activity already exists, the result will have a status code of 409.
Upload fixed in 1.4.4, Garmin changed the upload api, the response `detailedImportResult` doesn't contain the new activityId.

```js
const upload = await GCClient.uploadActivity('./some/path/to/file.fit');
// not working
const activityId = upload.detailedImportResult.successes[0].internalId;
const uploadId = upload.detailedImportResult.uploadId;
```

### Upload activity image

Uploads an image to activity

```js
const [latestActivty] = await GCClient.getActivities(0, 1);

const upload = await GCClient.uploadImage(
    latestActivty,
    './some/path/to/file.jpg'
);
```

### Delete activity image

Delete an image from activity

```js
const [activity] = await GCClient.getActivities(0, 1);
const activityDetails = await GCClient.getActivityDetails(activity.activityId);

await GCClient.deleteImage(
    activity,
    activityDetails.metadataDTO.activityImages[0].imageId
);
```

### `getSteps(date?: Date): Promise<number>`

Retrieves the total steps for a given date.

#### Parameters:

-   `date` (Date, optional): Date of the steps information requested; defaults to today if no date is supplied.

#### Returns:

-   `Promise<number>`: A Promise that resolves to the total steps for the specified date.

#### Example:

```js
const totalSteps = await GCClient.getSteps(new Date('2020-03-24'));
```

### `getSleepData(date: string): Promise<SleepData>`

Retrieves all sleep data for a given date

#### Parameters:

-   `date` (Date, optional): Date of information requested, this will default to today if no date is supplied

#### Returns:

-   `Promise<SleepData>`: A Promise that resolves to an object containing detailed sleep information.

    -   `dailySleepDTO` (object): Information about the user's daily sleep.
        -   `id` (number): The unique identifier of the sleep record.
        -   `userProfilePK` (number): The user's profile identifier.
        -   `calendarDate` (string): The date of the sleep record.
        -   ...
    -   `sleepMovement` (array): An array of sleep movement data.
    -   `remSleepData` (boolean): Indicates whether REM sleep data is available.
    -   `sleepLevels` (array): An array of sleep levels data.
    -   `restlessMomentsCount` (number): Count of restless moments during sleep.
    -   ...

#### Example:

```js
const detailedSleep = await GCClient.getSleepDuration(new Date('2020-03-24'));
```

### `getSleepDuration(date: string): Promise<{hours: number, minutes: number}`

Retrieves hours and minutes slept for a given date

#### Parameters:

-   `date` (Date, optional): Date of information requested, this will default to today if no date is supplied

#### Returns:

-   `Promise<{hours: string, minutes: string }>`: A Promise that resolves to an object containing information about the sleep duration

    -   `hours` (string): Number of hours
    -   `minutes` (string): Number of minutes

#### Example:

```js
const detailedSleep = await GCClient.getSleepDuration(new Date('2020-03-24'));
```

### `getDailyWeightData(date?: Date): Promise<number>`

Retrieves the daily weight and converts it from grams to pounds.

#### Parameters:

-   `date` (Date, optional): Date of information requested. Defaults to the current date.

#### Returns:

-   `Promise<number>`: A Promise that resolves to the daily weight converted from grams to pounds.

#### Throws:

-   `Error`: If valid daily weight data cannot be found for the specified date.

#### Example:

```js
const weightData = await GCClient.getDailyWeightData(new Date('2023-12-25'));
```

### `getDailyWeightInPounds(date?: Date): Promise<number>`

Retrieves the daily weight in pounds for a given date.

#### Parameters:

-   `date` (Date, optional): Date of information requested; defaults to today if no date is supplied.

#### Returns:

-   `Promise<number>`: A Promise that resolves to the daily weight in pounds.

#### Example:

```js
const weightInPounds = await GCClient.getDailyWeightInPounds(
    new Date('2020-03-24')
);
```

## `getDailyHydration(date?: Date): Promise<number>`

Retrieves the daily hydration data and converts it from milliliters to ounces.

### Parameters:

-   `date` (Date, optional): Date of the requested information. Defaults to the current date.

### Returns:

-   `Promise<number>`: A Promise that resolves to the daily hydration data converted from milliliters to ounces.

### Throws:

-   `Error`: If valid daily hydration data cannot be found for the specified date or if the response is invalid.

### Example:

```js
const hydrationInOunces = await GCClient.getDailyHydration(
    new Date('2023-12-25')
);
```

### `getWeight(date?: Date): Promise<DateWeight | null>`

Retrieves comprehensive weight and body composition data for a specific date.

#### Parameters:

-   `date` (Date, optional): Date of the requested information. Defaults to the current date.

#### Returns:

-   `Promise<DateWeight | null>`: A Promise that resolves to the weight data for the specified date, or `null` if no data is available.

#### DateWeight Interface:

```typescript
interface DateWeight {
    samplePk: number;
    date: number;
    calendarDate: string;
    weight: number; // Weight in kg
    bmi: number | null; // Body Mass Index
    bodyFat: number | null; // Body fat percentage
    bodyWater: number | null; // Body water percentage
    boneMass: number | null; // Bone mass in kg
    muscleMass: number | null; // Muscle mass in kg
    physiqueRating: number | null;
    visceralFat: number | null;
    metabolicAge: number | null;
    sourceType: string;
    timestampGMT: number;
    weightDelta: number; // Change from previous measurement
}
```

#### Example:

```js
const weight = await GCClient.getWeight(new Date('2023-12-25'));
if (weight) {
    console.log(`Weight: ${weight.weight} kg`);
    console.log(`BMI: ${weight.bmi}`);
    console.log(`Body Fat: ${weight.bodyFat}%`);
    console.log(`Muscle Mass: ${weight.muscleMass} kg`);
}
```

### `getHeartRate(date?: Date): Promise<HeartRate>`

Retrieves detailed heart rate data for a specific date, including resting heart rate, min/max values, and all measurements throughout the day.

#### Parameters:

-   `date` (Date, optional): Date of the requested information. Defaults to the current date.

#### Returns:

-   `Promise<HeartRate>`: A Promise that resolves to the heart rate data for the specified date.

#### HeartRate Interface:

```typescript
interface HeartRate {
    userProfilePK: number;
    calendarDate: string;
    startTimestampGMT: string;
    endTimestampGMT: string;
    startTimestampLocal: string;
    endTimestampLocal: string;
    maxHeartRate: number; // Maximum heart rate (bpm)
    minHeartRate: number; // Minimum heart rate (bpm)
    restingHeartRate: number; // Resting heart rate (bpm)
    lastSevenDaysAvgRestingHeartRate: number; // 7-day average (bpm)
    heartRateValueDescriptors: HeartRateValueDescriptor[];
    heartRateValues: HeartRateEntry[][]; // All HR measurements
}
```

#### Example:

```js
const hr = await GCClient.getHeartRate(new Date('2023-12-25'));
console.log(`Resting HR: ${hr.restingHeartRate} bpm`);
console.log(`Max HR: ${hr.maxHeartRate} bpm`);
console.log(`Min HR: ${hr.minHeartRate} bpm`);
console.log(`7-Day Avg: ${hr.lastSevenDaysAvgRestingHeartRate} bpm`);

// Access individual measurements
hr.heartRateValues.forEach((measurements) => {
    measurements.forEach((entry) => {
        const time = new Date(entry.timestamp);
        console.log(`${time.toLocaleTimeString()}: ${entry.heartrate} bpm`);
    });
});
```

### Example: Fetch Health Data

See [examples/fetch_health_data.js](examples/fetch_health_data.js) for a complete example that fetches weight and heart rate data:

```bash
node examples/fetch_health_data.js
```

This example demonstrates:

-   Fetching weight data for multiple dates
-   Accessing body composition metrics (BMI, body fat, muscle mass)
-   Retrieving heart rate data with all measurements
-   Handling dates when no data is available

### `getGolfSummary(): Promise<GolfSummary>`

Retrieves a summary of golf scorecard data.

#### Returns:

-   `Promise<GolfSummary>`: A Promise that resolves to the golf scorecard summary.

#### Example:

```js
const golfSummary = await GCClient.getGolfSummary();
```

### `getGolfScorecard(scorecardId: number): Promise<GolfScorecard>`

Retrieves golf scorecard data for a specific scorecard.

#### Parameters:

-   `scorecardId` (number): Identifier for the desired golf scorecard.

#### Returns:

-   `Promise<GolfScorecard>`: A Promise that resolves to the golf scorecard data.

#### Example:

```js
const scorecardId = 123; // Replace with the desired scorecard ID
const golfScorecard = await GCClient.getGolfScorecard(scorecardId);
```

### `getHeartRate(date?: Date): Promise<HeartRate>`

Retrieves daily heart rate data for a given date.

#### Parameters:

-   `date` (Date, optional): Date of the heart rate data requested; defaults to today if no date is supplied.

#### Returns:

-   `Promise<HeartRate>`: A Promise that resolves to the daily heart rate data.

#### Example:

```js
const heartRateData = await GCClient.getHeartRate(new Date('2020-03-24'));
```

## Modifying data

### Update activity is not implemented yet. // TODO: Implement this function

```js
const activities = await GCClient.getActivities(0, 1);
const activity = activities[0];
activity['activityName'] = 'The Updated Name';
await GCClient.updateActivity(activity);
```

### Delete an activity

Deletes an activty.

```js
const activities = await GCClient.getActivities(0, 1);
const activity = activities[0];
await GCClient.deleteActivity(activity);
```

### `updateHydrationLogOunces(date?: Date, valueInOz: number): Promise<WaterIntake>`

Adds a hydration log entry in ounces for a given date.

#### Parameters:

-   `date` (Date, optional): Date of the log entry; defaults to today if no date is supplied.
-   `valueInOz` (number): Amount of water intake in ounces. Accepts negative number.

#### Returns:

-   `Promise<WaterIntake>`: A Promise that resolves to the hydration log entry.

#### Example:

```js
const hydrationLogEntry = await GCClient.addHydrationLogOunces(
    new Date('2020-03-24'),
    16
);
```

### `updateWeight(date = new Date(), lbs: number, timezone: string): Promise<UpdateWeight>`

Updates weight information

#### Parameters:

-   `date` (optional): Date object representing the weight entry date. Defaults to the current date if not provided.
-   `lbs` (number): Weight value in pounds.
-   `timezone` (string): String representing the timezone for the weight entry.

#### Returns:

-   `Promise<UpdateWeight>`: A Promise that resolves to the result of the weight update.

#### Example:

```js
await GCClient.updateWeight(undefined, 202.9, 'America/Los_Angeles');
```

### Add workout

To add a custom workout, use the `addWorkout` or more specifically `addRunningWorkout`.

```js
GCClient.addRunningWorkout('My 5k run', 5000, 'Some description');
```

Will add a running workout of 5km called 'My 5k run' and return a JSON object representing the saved workout.

### Schedule workout

To add a workout to your calendar, first find your workout and then add it to a specific date.

```js
const workouts = await GCClient.getWorkouts();
const id = workouts[0].workoutId;
GCClient.scheduleWorkout({ workoutId: id }, new Date('2020-03-24'));
```

This will add the workout to a specific date in your calendar and make it show up automatically if you're using any of the Garmin watches.

### Delete workout

Deleting a workout is very similar to [scheduling](#schedule-workout) one.

```js
const workouts = await GCClient.getWorkouts();
const id = workouts[0].workoutId;
GCClient.deleteWorkout({ workoutId: id });
```

## Custom requests

This library will handle custom requests to your active Garmin Connect session. There are a lot of different url's that is used, which means that this library probably wont cover them all. By using the network analyze tool you can find url's that are used by Garmin Connect to fetch data.

Let's assume I found a `GET` requests to the following url:

```
https://connect.garmin.com/modern/proxy/wellness-service/wellness/dailyHeartRate/22f5f84c-de9d-4ad6-97f2-201097b3b983?date=2020-03-24
```

The request can be sent using `GCClient` by running

```js
// You can get your displayName by using the getUserInfo method;
const displayName = '22f5f84c-de9d-4ad6-97f2-201097b3b983';
const url =
    'https://connect.garmin.com/modern/proxy/wellness-service/wellness/dailyHeartRate/';
const dateString = '2020-03-24';
GCClient.get(url + displayName, { date: dateString });
```

and will net you the same result as using the provided way

```js
GCClient.getHeartRate();
```

Notice how the client will keep track of the url's, your user information as well as keeping the session alive.

## Limitations

Many responses from Garmin Connect are missing type definitions and defaults to `unknown`. Feel free to add types by opening a pull request.

For now, this library only supports the following:

-   Get user info
-   Get social user info
-   Get heart rate
-   Set body weight
-   Get list of workouts
-   Add new workouts
-   Add workouts to you calendar
-   Remove previously added workouts
-   Get list of activities
-   Get details about one specific activity
-   Get the step count
-   Get earned badges
-   Get available badges
-   Get details about one specific badge
