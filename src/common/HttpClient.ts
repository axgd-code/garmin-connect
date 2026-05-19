import _ from 'lodash';
import { DateTime } from 'luxon';
import OAuth from 'oauth-1.0a';
import qs from 'qs';
import FormData from 'form-data';
import CryptoJS from 'crypto-js';

import { UrlClass } from '../garmin/UrlClass';
import {
    IOauth1,
    IOauth1Consumer,
    IOauth1Token,
    IOauth2Token
} from '../garmin/types';
import { Logger, LogLevel } from './Logger';

export type { LogLevel };

// --- Fallback types for non-Obsidian environments ---
type RequestUrlResponse = any;
type RequestUrlParam = any;

// Import Obsidian requestUrl function (with fallback)
let requestUrl: (config: any) => Promise<any>;

try {
    const obsidian = require('obsidian');
    const _obsidianRequestUrl = obsidian.requestUrl;
    // Always use throw:false so we handle errors ourselves and can always
    // read response bodies/headers even on non-2xx status codes.
    requestUrl = (config: any) =>
        _obsidianRequestUrl({ ...config, throw: false });
} catch (e) {
    // Fallback for non-Obsidian environments (Node.js)
    requestUrl = async (config: any) => {
        // Use Node.js native fetch (available in Node 18+)
        const response = await fetch(config.url, {
            method: config.method || 'GET',
            headers: config.headers || {},
            body: config.body
        });

        // Read body once as arrayBuffer
        const arrayBuffer = await response.arrayBuffer();
        const text = new TextDecoder().decode(arrayBuffer);

        let json: any;
        try {
            json = JSON.parse(text);
        } catch (e) {
            json = undefined;
        }

        // Convert headers to plain object
        // Use getSetCookie() for set-cookie to preserve all cookies (Node 18+)
        const headers: Record<string, string | string[]> = {};
        response.headers.forEach((value: string, key: string) => {
            if (key.toLowerCase() !== 'set-cookie') {
                headers[key] = value;
            }
        });
        // Handle set-cookie separately to keep all cookies as array
        try {
            const setCookies = (response.headers as any).getSetCookie?.();
            if (setCookies && setCookies.length > 0) {
                headers['set-cookie'] = setCookies;
            } else {
                const sc = response.headers.get('set-cookie');
                if (sc) headers['set-cookie'] = [sc];
            }
        } catch (_e) {
            const sc = response.headers.get('set-cookie');
            if (sc) headers['set-cookie'] = [sc];
        }

        return {
            status: response.status,
            headers: headers,
            text: text,
            arrayBuffer: arrayBuffer,
            json: json
        };
    };
}

// --- Types adapted for Obsidian ---
interface ObsidianResponseData<T = any> extends RequestUrlResponse {
    json: T;
}

// --- Regular Expressions CORRECTED ---
const CSRF_RE = /name="_csrf"\s+value="([^"]+)"|value="([^"]+)"\s+name="_csrf"/;
const TICKET_RE = /ticket=([^"&]+)/;
const ACCOUNT_LOCKED_RE = /var status\s*=\s*"([^"]*)"/;
const PAGE_TITLE_RE = /<title>([^<]*)<\/title>/;

// --- Constants ---
const USER_AGENT_CONNECTMOBILE = 'com.garmin.android.apps.connectmobile';
const USER_AGENT_BROWSER =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const OAUTH_CONSUMER_URL =
    'https://thegarth.s3.amazonaws.com/oauth_consumer.json';

// --- Global Token Store Interface (for mobile/plugin environments) ---
interface GlobalTokenStore {
    syncLoad?: () => {
        oauth1Token?: IOauth1Token;
        oauth2Token?: IOauth2Token;
    } | null;
    syncSave?: (tokens: {
        oauth1Token?: IOauth1Token;
        oauth2Token?: IOauth2Token;
    }) => void;
    syncClear?: () => void;
}

declare global {
    namespace globalThis {
        var __GarminTokenStore: GlobalTokenStore | undefined;
    }
}

// --- Token Refresh Logic (Global) ---
let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

// --- HttpClient Config (customizable) ---
export interface TokenPersistence {
    load: () => Promise<
        | { oauth1Token?: IOauth1Token; oauth2Token?: IOauth2Token }
        | null
        | undefined
    >;
    save: (tokens: {
        oauth1Token?: IOauth1Token;
        oauth2Token?: IOauth2Token;
    }) => Promise<void>;
    clear?: () => Promise<void>;
}

export interface HttpClientConfig {
    /** Maximum number of retry attempts for 429 rate limit errors (default: 5) */
    maxRetries?: number;
    /** Deprecated: path-based persistence is not available in Obsidian/mobile environments */
    tokenFilePath?: string;
    /** Optional async persistence adapter (e.g., Obsidian vault) */
    tokenPersistence?: TokenPersistence;
    /** Log level: 'silent' | 'error' | 'warn' | 'info' | 'debug' (default: 'error') */
    logLevel?: 'silent' | 'error' | 'warn' | 'info' | 'debug';
}

// --- Migrated HttpClient Class ---
export class HttpClient {
    url: UrlClass;
    oauth1Token: IOauth1Token | undefined;
    oauth2Token: IOauth2Token | undefined;
    OAUTH_CONSUMER: IOauth1Consumer | undefined;

    // Common headers
    private commonHeaders: Record<string, string> = {};

    // Cookie store to maintain session across stateless requestUrl calls
    private cookieJar: Map<string, string> = new Map();

    // Configuration
    private maxRetries: number = 5;
    private tokenPersistence?: TokenPersistence;
    private logger: Logger;
    private _tokenLoadPromise: Promise<void> | null = null;

    constructor(url: UrlClass, config?: HttpClientConfig) {
        this.url = url;

        // Initialize logger with configured level
        this.logger = new Logger(config?.logLevel || 'error');

        // Apply configuration
        if (config?.maxRetries !== undefined) {
            this.maxRetries = config.maxRetries;
        }
        if (config?.tokenFilePath !== undefined) {
            this.logger.warn(
                'tokenFilePath is deprecated in Obsidian/mobile environments. Use tokenPersistence instead.'
            );
        }
        this.tokenPersistence = config?.tokenPersistence;

        // Set default headers for all requests
        // This helps pass anti-bot protections
        this.commonHeaders = {
            'User-Agent': USER_AGENT_BROWSER,
            'Accept-Language': 'en-US,en;q=0.9',
            // NOTE: In Obsidian (mobile/plugin), requestUrl doesn't auto-decompress
            // So we avoid gzip/deflate to get plain text responses
            'Accept-Encoding': 'identity',
            DNT: '1',
            Connection: 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Cache-Control': 'max-age=0'
        };

        // Try to load persisted tokens — store the promise so login() can await it
        this._tokenLoadPromise = this.loadTokensFromPersistence().catch(
            (err) => {
                this.logger.warn(
                    'Failed to load persisted tokens:',
                    (err as any)?.message || err
                );
            }
        );
    }

    /**
     * Helper to safely access response.json in Obsidian
     * because response.json is a getter that can throw an exception
     */
    private safeGetJson<T>(response: RequestUrlResponse): T | null {
        try {
            const json = response.json;
            return json as T;
        } catch (error) {
            // JSON parsing failed (probably HTML response)
            return null;
        }
    }

    // Extract cookies from response
    private extractCookies(response: RequestUrlResponse): void {
        if (!response.headers) {
            this.logger.debug('🍪 extractCookies: no headers in response');
            return;
        }

        // Log all header keys to debug cookie visibility in Obsidian
        this.logger.debug(
            '🍪 Response header keys:',
            Object.keys(response.headers).join(', ')
        );

        // Handle set-cookie as array or single string.
        // In Obsidian (Electron), multiple set-cookie headers are combined into
        // a single \n-separated string because RequestUrlResponse.headers is
        // Record<string, string>. We must split by \n to get individual cookies.
        const rawCookies: string[] = [];
        const headers = response.headers;

        const splitCookieHeader = (raw: string): string[] =>
            raw
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean);

        // Try all case variations (Obsidian may lowercase or capitalize)
        for (const key of Object.keys(headers)) {
            if (key.toLowerCase() === 'set-cookie') {
                const val = headers[key];
                if (Array.isArray(val)) {
                    rawCookies.push(...val);
                } else if (typeof val === 'string') {
                    rawCookies.push(...splitCookieHeader(val));
                }
            }
        }

        this.logger.debug(`🍪 Found ${rawCookies.length} cookie(s) to parse`);

        for (const cookieStr of rawCookies) {
            // Handle expired cookies (Max-Age=0 or Expires in the past)
            const maxAgeMatch = /Max-Age=0/i.exec(cookieStr);

            // Parse "name=value; Path=/; ..." — only keep name=value part
            const parts = cookieStr.split(';');
            const nameValue = parts[0].trim();
            const eqIdx = nameValue.indexOf('=');
            if (eqIdx === -1) continue;
            const name = nameValue.substring(0, eqIdx).trim();
            const value = nameValue.substring(eqIdx + 1).trim();
            if (!name) continue;

            if (maxAgeMatch) {
                // Server is deleting this cookie
                this.cookieJar.delete(name);
                this.logger.debug('🍪 Cookie deleted:', name);
            } else {
                this.cookieJar.set(name, value);
                this.logger.debug('🍪 Cookie stored:', name);
            }
        }
        this.logger.debug(
            `🍪 Jar now has ${this.cookieJar.size} cookies:`,
            [...this.cookieJar.keys()].join(', ')
        );
    }

    // Build Cookie header from jar
    private getCookieHeader(): string {
        const cookies = Array.from(this.cookieJar.entries())
            .map(([name, value]) => `${name}=${value}`)
            .join('; ');
        return cookies;
    }

    /**
     * Execute an HTTP request using requestUrl and implement manual
     * interceptor logic (auth token and refresh token).
     */
    private async _request<T>(
        config: RequestUrlParam,
        isRetry: boolean = false,
        retryCount: number = 0
    ): Promise<ObsidianResponseData<T>> {
        // Ensure token is valid before making requests
        try {
            await this.checkTokenVaild();
        } catch (err) {
            // If token refresh fails we continue and let login flow handle it
            this.logger.warn(
                'checkTokenVaild failed:',
                (err as any)?.message || err
            );
        }
        const finalConfig: RequestUrlParam = {
            ...config,
            headers: {
                ...this.commonHeaders,
                ...(config.headers || {})
            }
        };

        // Always inject cookies manually.
        // - In Node.js, fetch has no automatic cookie store.
        // - In Obsidian, requestUrl is a stateless HTTP wrapper with no session
        //   cookie management — cookies must be forwarded explicitly.
        if (this.cookieJar.size > 0) {
            const cookieHeader = this.getCookieHeader();
            if (cookieHeader) {
                finalConfig.headers!['Cookie'] = cookieHeader;
            }
        }

        // Request interceptor logic (add authentication token)
        if (this.oauth2Token && !finalConfig.headers?.Authorization) {
            finalConfig.headers!.Authorization =
                'Bearer ' + this.oauth2Token.access_token;
        }

        try {
            // Debug: log request (only for signin URLs)
            if (finalConfig.url?.includes('signin')) {
                this.logger.debug(
                    '🌐 REQUEST:',
                    finalConfig.method,
                    finalConfig.url
                );
                this.logger.debug(
                    '🌐 HEADERS:',
                    JSON.stringify(finalConfig.headers, null, 2)
                );
                const bodyLength = finalConfig.body
                    ? typeof finalConfig.body === 'string'
                        ? finalConfig.body.length
                        : finalConfig.body.byteLength
                    : 0;
                this.logger.debug('🌐 BODY LENGTH:', bodyLength);
            }

            const response: RequestUrlResponse = await requestUrl(finalConfig);

            // Debug: log full response (only for signin URLs)
            if (finalConfig.url?.includes('signin')) {
                this.logger.debug('✅ RESPONSE STATUS:', response.status);
                this.logger.debug('✅ RESPONSE TYPE:', typeof response);
                this.logger.debug('✅ RESPONSE KEYS:', Object.keys(response));
                this.logger.debug(
                    '✅ RESPONSE HEADERS:',
                    response.headers ? 'Present' : 'Missing'
                );
                this.logger.debug(
                    '✅ RESPONSE TEXT:',
                    response.text
                        ? `${response.text.substring(0, 100)}...`
                        : 'Missing'
                );
                // DO NOT access response.json here because it's a getter that may throw
            }

            // Extract and store cookies from the response
            this.extractCookies(response);

            // Attempt to parse the body as JSON in a safe manner
            let data: T;
            const jsonData = this.safeGetJson<T>(response);

            if (jsonData !== null) {
                // On a réussi à parser le JSON
                data = jsonData;
            } else if (response.text) {
                // Pas de JSON valide, utiliser le texte (HTML typiquement)
                data = response.text as unknown as T;
            } else {
                // Aucune donnée disponible
                data = undefined as unknown as T;
            }

            // Handle rate limiting (429) with retries respecting Retry-After header
            if (response.status === 429) {
                const BASE_DELAY_MS = 1000; // 1s base

                // attempt to read Retry-After header (cases)
                const headersAny: any = response.headers || {};
                const retryAfterHeader =
                    headersAny['retry-after'] ||
                    headersAny['Retry-After'] ||
                    headersAny['Retry-after'];

                let delayMs =
                    BASE_DELAY_MS * Math.pow(2, Math.max(0, retryCount));
                if (retryAfterHeader) {
                    const asInt = parseInt(String(retryAfterHeader), 10);
                    if (!isNaN(asInt)) {
                        delayMs = asInt * 1000;
                    } else {
                        const parsed = Date.parse(String(retryAfterHeader));
                        if (!isNaN(parsed)) {
                            const until = parsed - Date.now();
                            if (until > 0) delayMs = until;
                        }
                    }
                }

                if (retryCount < this.maxRetries) {
                    this.logger.warn(
                        `HTTP 429 received - retrying in ${Math.round(
                            delayMs
                        )}ms (attempt ${retryCount + 1}/${this.maxRetries})`
                    );
                    await new Promise((resolve) =>
                        setTimeout(resolve, delayMs)
                    );
                    return this._request<T>(config, true, retryCount + 1);
                }

                // Exceeded retries, fallthrough to error handling below
                this.logger.error(
                    `HTTP 429: Max retries (${this.maxRetries}) exceeded`
                );
            }

            // Manual error handling for other statuses
            if (response.status >= 400) {
                this.handleHttpError(response);
            }

            // IMPORTANT: Ne pas utiliser spread operator {...response} car response.json
            // est un getter qui peut lancer une exception
            return {
                status: response.status,
                headers: response.headers,
                text: response.text,
                arrayBuffer: response.arrayBuffer,
                json: data
            } as ObsidianResponseData<T>;
        } catch (error) {
            // Token refresh logic
            const status = (error as any)?.status || 0;
            const isNetworkError = !status && error instanceof Error;

            // Log error for debugging
            if (isNetworkError) {
                this.logger.error('Network error:', error.message);
                // If the error is related to JSON parsing, do not treat it as fatal
                if (
                    error.message.includes('is not valid JSON') ||
                    error.message.includes('Unexpected token')
                ) {
                    this.logger.warn(
                        'JSON parsing error ignored - response is likely HTML'
                    );
                    // Retrying the request without parsing won't help; propagate the error
                }
            }

            if (!isRetry && status === 401) {
                if (!this.oauth2Token) {
                    throw error;
                }

                if (isRefreshing) {
                    try {
                        const token = await new Promise<string>((resolve) => {
                            refreshSubscribers.push(resolve);
                        });
                        finalConfig.headers!.Authorization = `Bearer ${token}`;
                        return this._request<T>(finalConfig, true);
                    } catch (err) {
                        this.logger.error(
                            "Erreur lors de l'attente du token rafraîchi:",
                            err
                        );
                        throw err;
                    }
                }

                isRefreshing = true;
                try {
                    this.logger.debug('interceptors: refreshOauth2Token start');
                    await this.refreshOauth2Token();
                    this.logger.debug('interceptors: refreshOauth2Token end');
                } catch (refreshError) {
                    isRefreshing = false;
                    throw refreshError;
                }

                isRefreshing = false;
                refreshSubscribers.forEach((subscriber) =>
                    subscriber(this.oauth2Token!.access_token)
                );
                refreshSubscribers = [];

                finalConfig.headers!.Authorization = `Bearer ${
                    this.oauth2Token!.access_token
                }`;
                return this._request<T>(finalConfig, true);
            }
            throw error;
        }
    }

    // --- Token persistence helpers ---
    private async loadTokensFromPersistence(): Promise<void> {
        // Try global store first (for mobile/plugin environments)
        try {
            const globalStore =
                typeof globalThis !== 'undefined'
                    ? (globalThis as any).__GarminTokenStore
                    : undefined;
            if (
                globalStore?.syncLoad &&
                typeof globalStore.syncLoad === 'function'
            ) {
                const cached = globalStore.syncLoad();
                if (cached) {
                    if (cached.oauth1Token)
                        this.oauth1Token = cached.oauth1Token;
                    if (cached.oauth2Token)
                        this.oauth2Token = cached.oauth2Token;
                    this.logger.info(
                        '✅ Persisted tokens loaded from plugin data'
                    );
                    return;
                }
            }
        } catch (e) {
            this.logger.warn(
                'Token load via plugin data failed:',
                (e as any)?.message || e
            );
        }

        // Fallback to async adapter if available
        if (!this.tokenPersistence) return;
        try {
            const stored = await this.tokenPersistence.load();
            if (stored?.oauth1Token) this.oauth1Token = stored.oauth1Token;
            if (stored?.oauth2Token) this.oauth2Token = stored.oauth2Token;
            if (stored?.oauth1Token || stored?.oauth2Token) {
                this.logger.info('✅ Persisted tokens loaded via adapter');
            }
        } catch (err) {
            this.logger.warn(
                'Failed to load tokens via adapter:',
                (err as any)?.message || err
            );
        }
    }

    private async saveTokens(): Promise<void> {
        // Try global store first (for mobile/plugin environments)
        try {
            const globalStore =
                typeof globalThis !== 'undefined'
                    ? (globalThis as any).__GarminTokenStore
                    : undefined;
            if (
                globalStore?.syncSave &&
                typeof globalStore.syncSave === 'function'
            ) {
                globalStore.syncSave({
                    oauth1Token: this.oauth1Token,
                    oauth2Token: this.oauth2Token
                });
                return;
            }
        } catch (e) {
            this.logger.warn(
                'Token save via plugin data failed:',
                (e as any)?.message || e
            );
        }

        // Fallback to async adapter if available
        if (!this.tokenPersistence) return;
        try {
            await this.tokenPersistence.save({
                oauth1Token: this.oauth1Token,
                oauth2Token: this.oauth2Token
            });
        } catch (err) {
            this.logger.warn(
                'Failed to persist tokens:',
                (err as any)?.message || err
            );
        }
    }

    /**
     * Clear persisted OAuth tokens using provided adapter (if any)
     */
    public async clearPersistedTokens(): Promise<void> {
        // Try global store first (for mobile/plugin environments)
        try {
            const globalStore =
                typeof globalThis !== 'undefined'
                    ? (globalThis as any).__GarminTokenStore
                    : undefined;
            if (
                globalStore?.syncClear &&
                typeof globalStore.syncClear === 'function'
            ) {
                globalStore.syncClear();
            }
        } catch (e) {
            this.logger.warn(
                'Token clear via plugin data failed:',
                (e as any)?.message || e
            );
        }

        // Fallback to async adapter if available
        if (this.tokenPersistence?.clear) {
            try {
                await this.tokenPersistence.clear();
                this.logger.info('✅ Persisted tokens cleared via adapter');
            } catch (err) {
                this.logger.warn(
                    'Failed to clear persisted tokens:',
                    (err as any)?.message || err
                );
            }
        }
        // Also clear in-memory tokens
        this.oauth1Token = undefined;
        this.oauth2Token = undefined;
    }

    // --- Public HTTP Methods ---

    async get<T>(
        url: string,
        options?: {
            params?: Record<string, any>;
            headers?: Record<string, string>;
            responseType?: 'arraybuffer';
        }
    ): Promise<T> {
        let finalUrl = url;
        if (options?.params) {
            const queryString = qs.stringify(options.params);
            finalUrl = `${url}?${queryString}`;
        }
        const response = await this._request<T>({
            url: finalUrl,
            method: 'GET',
            headers: options?.headers
        });
        const data =
            response.json !== undefined && response.json !== null
                ? response.json
                : (response.text as unknown as T);
        if (options?.responseType === 'arraybuffer') {
            return Buffer.from(response.text) as T;
        }
        return data;
    }

    async post<T>(
        url: string,
        data: any,
        options?: {
            params?: Record<string, any>;
            headers?: Record<string, string>;
        }
    ): Promise<T> {
        let finalUrl = url;
        if (options?.params) {
            const queryString = qs.stringify(options.params);
            finalUrl = `${url}?${queryString}`;
        }

        let body: string | undefined;
        let headers = { ...options?.headers };

        // CORRECTION: Detect and handle FormData correctly
        if (
            data &&
            typeof data.getHeaders === 'function' &&
            typeof data.getBuffer === 'function'
        ) {
            // It's a FormData object from 'form-data' library
            const buffer = data.getBuffer();
            // Convert Buffer to string for requestUrl
            body = buffer.toString('utf-8');
            // Get multipart headers (includes Content-Type with boundary)
            const formHeaders = data.getHeaders();
            headers = { ...formHeaders, ...headers };
            this.logger.debug('📋 Using multipart/form-data with boundary');
            if (body) {
                this.logger.debug('📋 Body length:', body.length);
                this.logger.debug('📋 Body preview:', body.substring(0, 200));
            }
        } else {
            // Normal data (object, string, etc.)
            const contentType = headers['Content-Type'] || 'application/json';

            if (contentType.includes('application/x-www-form-urlencoded')) {
                body = qs.stringify(data);
            } else if (contentType.includes('application/json')) {
                body = JSON.stringify(data);
            } else if (typeof data === 'string') {
                body = data;
            }
        }

        const response = await this._request<T>({
            url: finalUrl,
            method: 'POST',
            headers: headers,
            body: body
        });

        // Return response.json if it exists, otherwise response.text
        // For HTML responses (like login), response.json will be undefined
        return response.json !== undefined && response.json !== null
            ? response.json
            : (response.text as unknown as T);
    }

    async put<T>(
        url: string,
        data: any,
        options?: {
            params?: Record<string, any>;
            headers?: Record<string, string>;
        }
    ): Promise<T> {
        let finalUrl = url;
        if (options?.params) {
            const queryString = qs.stringify(options.params);
            finalUrl = `${url}?${queryString}`;
        }

        const body = JSON.stringify(data);
        const response = await this._request<T>({
            url: finalUrl,
            method: 'PUT',
            headers: {
                ...options?.headers,
                'Content-Type':
                    options?.headers?.['Content-Type'] || 'application/json'
            },
            body
        });
        return response.json;
    }

    async delete<T>(
        url: string,
        options?: {
            params?: Record<string, any>;
            headers?: Record<string, string>;
        }
    ): Promise<T> {
        const response = await this.post<T>(url, null, {
            params: options?.params,
            headers: {
                ...options?.headers,
                'X-Http-Method-Override': 'DELETE'
            }
        });
        return response;
    }

    // --- Configuration ---

    setCommonHeader(headers: Record<string, string>): void {
        this.commonHeaders = { ...this.commonHeaders, ...headers };
    }

    // --- Error Handling ---

    handleError(response: RequestUrlResponse): void {
        this.handleHttpError(response);
    }

    handleHttpError(response: RequestUrlResponse): void {
        const { status, text } = response;

        // Log detailed error info
        this.logger.error(`🔴 HTTP ${status} Error`);
        if (text && text.length < 1000) {
            this.logger.error('Response body:', text);
        } else if (text) {
            this.logger.error(
                'Response body (truncated):',
                text.substring(0, 500)
            );
        }

        // Special case for 403 - probably Cloudflare
        if (status === 403) {
            const isCloudflare =
                text?.includes('Cloudflare') ||
                text?.includes('cf-browser-verification') ||
                text?.includes('cf_clearance');

            if (isCloudflare) {
                this.logger.error('Cloudflare protection detected (403)');
                throw new Error(
                    'Cloudflare protection detected. This operation requires a real browser environment. ' +
                        'Please run this code inside Obsidian, not as a standalone script.'
                );
            }
        }

        const msg = `ERROR: (${status}), ${
            status === 401 ? 'Unauthorized' : 'HTTP Error'
        }, ${text?.substring(0, 200) || 'No response body'}`;
        this.logger.error(msg);
        throw new Error(msg);
    }

    // --- Authentication Methods ---

    async fetchOauthConsumer() {
        const response = await requestUrl({
            url: OAUTH_CONSUMER_URL,
            method: 'GET'
        });

        if (response.status !== 200) {
            throw new Error(
                `Failed to fetch OAuth Consumer: ${response.status}`
            );
        }

        this.OAUTH_CONSUMER = {
            key: response.json.consumer_key,
            secret: response.json.consumer_secret
        };
    }

    async checkTokenVaild() {
        if (this.oauth2Token) {
            if (this.oauth2Token.expires_at < DateTime.now().toSeconds()) {
                this.logger.error('Token expired!');
                await this.refreshOauth2Token();
            }
        }
    }

    /**
     * Login to Garmin Connect
     * @param username
     * @param password
     * @returns {Promise<HttpClient>}
     */
    async login(username: string, password: string): Promise<HttpClient> {
        try {
            // Wait for any in-flight token load before checking
            if (this._tokenLoadPromise) {
                await this._tokenLoadPromise;
                this._tokenLoadPromise = null;
            }

            // If we already have valid tokens, skip the full SSO flow
            if (this.oauth1Token && this.oauth2Token) {
                this.logger.info(
                    '♻️ Valid tokens found, skipping SSO login...'
                );
                try {
                    await this.checkTokenVaild();
                    this.logger.info(
                        '✅ Session restored from persisted tokens'
                    );
                    return this;
                } catch (refreshErr) {
                    this.logger.warn(
                        'Token refresh failed, falling back to full login:',
                        (refreshErr as any)?.message
                    );
                    this.oauth1Token = undefined;
                    this.oauth2Token = undefined;
                }
            }

            this.logger.info('🔐 Starting Garmin login...');
            await this.fetchOauthConsumer();

            this.logger.info('🎫 Getting login ticket...');
            const ticket = await this.getLoginTicket(username, password);

            this.logger.info('🔑 Getting OAuth1 token...');
            const oauth1 = await this.getOauth1Token(ticket);

            this.logger.info('🔄 Exchanging for OAuth2 token...');
            await this.exchange(oauth1);

            this.logger.info('✅ Login successful!');
            return this;
        } catch (error) {
            const errorMsg =
                error instanceof Error ? error.message : String(error);

            // Détecter Cloudflare 403
            if (errorMsg.includes('403') || errorMsg.includes('Cloudflare')) {
                this.logger.error('❌ Cloudflare protection detected');
                throw new Error(
                    'Garmin login blocked by Cloudflare protection. ' +
                        'This can happen if:\n' +
                        '1. You login too frequently (wait a few minutes)\n' +
                        '2. Garmin detects unusual activity\n' +
                        '3. Your IP is flagged\n\n' +
                        'Try again in a few minutes, or login manually on garmin.com first.'
                );
            }

            throw error;
        }
    }

    private async getLoginTicket(
        username: string,
        password: string
    ): Promise<string> {
        // Step1: Always start with a fresh login
        // Do not reuse tickets from previous sessions
        const step1Params = {
            clientId: 'GarminConnect',
            locale: 'en',
            service: this.url.GC_MODERN
        };
        const step1Url = `${this.url.GARMIN_SSO_EMBED}?${qs.stringify(
            step1Params
        )}`;
        await this.get<string>(step1Url);

        // NOTE: We intentionally ignore tickets found in step1
        // because they can be invalid or cause issues with Cloudflare

        // Small delay to allow the server to process
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Step2 Get _csrf
        const step2Params = {
            id: 'gauth-widget',
            embedWidget: 'true',
            locale: 'en',
            gauthHost: this.url.GARMIN_SSO_EMBED
        };
        const step2Url = `${this.url.SIGNIN_URL}?${qs.stringify(step2Params)}`;
        const step2Result = await this.get<string>(step2Url);

        // FIX: Improved CSRF token capture
        const csrfRegResult = CSRF_RE.exec(step2Result);
        if (!csrfRegResult) {
            this.logger.error('CSRF token not found in HTML.');
            this.logger.error(
                'Response preview:',
                step2Result.substring(0, 500)
            );
            throw new Error('login - csrf not found');
        }
        const csrf_token = csrfRegResult[1] || csrfRegResult[2];

        this.logger.debug(
            'CSRF token found:',
            csrf_token.substring(0, 10) + '...'
        );

        // Small delay before POST to allow Cloudflare cookies to settle
        // and simulate human browsing behavior (3-5 seconds random delay)
        const cfDelay = 3000 + Math.floor(Math.random() * 2000);
        await new Promise((resolve) => setTimeout(resolve, cfDelay));

        // Step3 Get ticket - Use URL-encoded body instead of FormData
        const signinParams = {
            id: 'gauth-widget',
            embedWidget: 'true',
            clientId: 'GarminConnect',
            locale: 'en',
            gauthHost: this.url.GARMIN_SSO_EMBED,
            service: this.url.GARMIN_SSO_EMBED,
            source: this.url.GARMIN_SSO_EMBED,
            redirectAfterAccountLoginUrl: this.url.GARMIN_SSO_EMBED,
            redirectAfterAccountCreationUrl: this.url.GARMIN_SSO_EMBED
        };
        const step3Url = `${this.url.SIGNIN_URL}?${qs.stringify(signinParams)}`;

        // FIX: Use a simple object instead of FormData
        // requestUrl does not handle multipart FormData well
        const step3Data = {
            username: username,
            password: password,
            embed: 'true',
            _csrf: csrf_token
        };

        // FIX: Improved headers for URL-encoded POST
        let step3Result: string;
        this.logger.debug(
            '🔑 Step3 cookie jar before POST:',
            [...this.cookieJar.keys()].join(', ')
        );
        this.logger.debug('🔑 Step3 cookie count:', this.cookieJar.size);
        try {
            step3Result = await this.post<string>(step3Url, step3Data, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    DNT: '1',
                    Origin: this.url.GARMIN_SSO_ORIGIN,
                    Referer: step2Url,
                    'User-Agent': USER_AGENT_BROWSER
                }
            });
        } catch (error) {
            const errorMsg =
                error instanceof Error ? error.message : String(error);
            this.logger.error('Step3 POST failed:', errorMsg);
            throw new Error(`Step3 POST failed: ${errorMsg}`);
        }

        // Verify that step3Result is a string
        if (!step3Result || typeof step3Result !== 'string') {
            this.logger.error(
                'Step3 result is not a string:',
                typeof step3Result,
                step3Result
            );
            throw new Error('Step3 failed: Invalid response from server');
        }

        this.handleAccountLocked(step3Result);
        this.handlePageTitle(step3Result);
        this.handleMFA(step3Result);

        // Check if we have the ticket directly in step3
        let ticketRegResult = TICKET_RE.exec(step3Result);
        if (ticketRegResult) {
            const ticket = ticketRegResult[1];
            this.logger.debug(
                'Ticket found in step3:',
                ticket.substring(0, 20) + '...'
            );
            return ticket;
        }

        // If no ticket in step3, it may be an embed page that requires
        // an additional request to obtain the ticket
        this.logger.debug(
            "No ticket in step3, checking if it's an embed page..."
        );

        // Step4: If we have an embed page, call the authentication verification
        // endpoint which simulates what GAUTH.checkAuthentication() does
        if (step3Result.includes('GAUTH.checkAuthentication')) {
            this.logger.debug(
                'Embed page detected, calling authentication check endpoint...'
            );

            // The verification endpoint is typically /sso/verifyauth
            const verifyParams = {
                clientId: 'GarminConnect',
                service: this.url.GC_MODERN,
                locale: 'en'
            };
            const verifyUrl = `${
                this.url.GARMIN_SSO_ORIGIN
            }/sso/verifyauth/initialize?${qs.stringify(verifyParams)}`;

            try {
                const verifyResult = await this.get<any>(verifyUrl);
                this.logger.debug('Verify auth result:', verifyResult);

                // The result should contain serviceTicket and serviceUrl
                if (verifyResult && typeof verifyResult === 'object') {
                    if (verifyResult.serviceTicket) {
                        this.logger.debug(
                            'Ticket found in verify result:',
                            verifyResult.serviceTicket.substring(0, 20) + '...'
                        );
                        return verifyResult.serviceTicket;
                    }
                    // Si on a un serviceUrl avec ticket
                    if (
                        verifyResult.serviceUrl &&
                        verifyResult.serviceUrl.includes('ticket=')
                    ) {
                        const urlTicket = TICKET_RE.exec(
                            verifyResult.serviceUrl
                        );
                        if (urlTicket) {
                            this.logger.debug(
                                'Ticket found in serviceUrl:',
                                urlTicket[1].substring(0, 20) + '...'
                            );
                            return urlTicket[1];
                        }
                    }
                }

                // Otherwise try to parse as a string
                if (typeof verifyResult === 'string') {
                    const verifyTicket = TICKET_RE.exec(verifyResult);
                    if (verifyTicket) {
                        this.logger.debug(
                            'Ticket found in verify string:',
                            verifyTicket[1].substring(0, 20) + '...'
                        );
                        return verifyTicket[1];
                    }
                }
            } catch (error) {
                this.logger.error('Verify auth failed:', error);
            }

            // If verification fails, try requesting the embed page again
            this.logger.debug(
                'Verify auth did not return ticket, trying embed page again...'
            );
            const embedResult = await this.get<string>(step1Url);

            ticketRegResult = TICKET_RE.exec(embedResult);
            if (ticketRegResult) {
                const ticket = ticketRegResult[1];
                this.logger.debug(
                    'Ticket found in embed page:',
                    ticket.substring(0, 20) + '...'
                );
                return ticket;
            }
        }

        // If still no ticket, error
        this.logger.error('Ticket not found in response');
        this.logger.error('Response type:', typeof step3Result);
        this.logger.error('Response length:', step3Result?.length || 0);
        if (step3Result) {
            this.logger.error(
                'Response preview:',
                step3Result.substring(0, 500)
            );
        }
        throw new Error(
            'login failed (Ticket not found or MFA), please check username and password'
        );
    }

    handleMFA(htmlStr: string): void {}

    handlePageTitle(htmlStr: string): void {
        const pageTitileRegResult = PAGE_TITLE_RE.exec(htmlStr);
        if (pageTitileRegResult) {
            const title = pageTitileRegResult[1];
            this.logger.debug('login page title:', title);
            if (_.includes(title, 'Update Phone Number')) {
                throw new Error(
                    "login failed (Update Phone number), please update your phone number, currently I don't know where to update it"
                );
            }
        }
    }

    handleAccountLocked(htmlStr: string): void {
        const accountLockedRegResult = ACCOUNT_LOCKED_RE.exec(htmlStr);
        if (accountLockedRegResult) {
            const msg = accountLockedRegResult[1];
            this.logger.error(msg);
            throw new Error(
                'login failed (AccountLocked), please open connect web page to unlock your account'
            );
        }
    }

    async refreshOauth2Token() {
        if (!this.OAUTH_CONSUMER) {
            await this.fetchOauthConsumer();
        }
        if (!this.oauth2Token || !this.oauth1Token) {
            throw new Error('No Oauth2Token or Oauth1Token');
        }
        const oauth1 = {
            oauth: this.getOauthClient(this.OAUTH_CONSUMER!),
            token: this.oauth1Token
        };
        await this.exchange(oauth1);
        this.logger.info('Oauth2 token refreshed!');
    }

    async getOauth1Token(ticket: string): Promise<IOauth1> {
        if (!this.OAUTH_CONSUMER) {
            throw new Error('No OAUTH_CONSUMER');
        }
        const params = {
            ticket,
            'login-url': this.url.GARMIN_SSO_EMBED,
            'accepts-mfa-tokens': true
        };
        const url = `${this.url.OAUTH_URL}/preauthorized?${qs.stringify(
            params
        )}`;

        this.logger.debug('🔑 getOauth1Token URL:', url);
        const oauth = this.getOauthClient(this.OAUTH_CONSUMER);

        const step4RequestData = {
            url: url,
            method: 'GET'
        };
        const headers = oauth.toHeader(oauth.authorize(step4RequestData));

        this.logger.debug(
            '🔑 OAuth1 authorization headers:',
            Object.keys(headers).join(', ')
        );

        const response = await this.get<string>(url, {
            headers: {
                ...headers,
                'User-Agent': USER_AGENT_CONNECTMOBILE
            }
        });

        this.logger.debug(
            '🔑 OAuth1 response type:',
            typeof response,
            'length:',
            String(response).length
        );
        if (typeof response === 'string' && response.length < 500) {
            this.logger.debug('🔑 OAuth1 response:', response);
        }

        const token = qs.parse(response) as unknown as IOauth1Token;
        this.logger.debug(
            '🔑 Parsed token keys:',
            Object.keys(token).join(', ')
        );
        this.oauth1Token = token;
        // Persist oauth1 token to avoid re-running full login flow
        this.saveTokens().catch(() => {});
        return { token, oauth };
    }

    getOauthClient(consumer: IOauth1Consumer): OAuth {
        const oauth = new OAuth({
            consumer: consumer,
            signature_method: 'HMAC-SHA1',
            hash_function(base_string: string, key: string) {
                // Use crypto-js for browser/mobile compatibility
                // IMPORTANT: Return base64-encoded HMAC-SHA1, not hex
                return CryptoJS.HmacSHA1(base_string, key).toString(
                    CryptoJS.enc.Base64
                );
            }
        });
        return oauth;
    }

    async exchange(oauth1: IOauth1) {
        const token = {
            key: oauth1.token.oauth_token,
            secret: oauth1.token.oauth_token_secret
        };

        const baseUrl = `${this.url.OAUTH_URL}/exchange/user/2.0`;
        const requestData = {
            url: baseUrl,
            method: 'POST',
            data: null
        };

        this.logger.debug('🔄 exchange OAuth1 → OAuth2');
        this.logger.debug(
            '🔄 OAuth1 token key:',
            token.key ? token.key.substring(0, 10) + '...' : 'MISSING'
        );
        this.logger.debug(
            '🔄 OAuth1 token secret:',
            token.secret ? 'present' : 'MISSING'
        );

        const step5AuthData = oauth1.oauth.authorize(requestData, token);
        this.logger.debug(
            '🔄 OAuth signature data keys:',
            Object.keys(step5AuthData).join(', ')
        );

        const url = `${baseUrl}?${qs.stringify(step5AuthData)}`;
        this.logger.debug(
            '🔄 Exchange URL (masked):',
            url.substring(0, 100) + '...'
        );

        this.oauth2Token = undefined;
        try {
            const response = await this.post<IOauth2Token>(url, null, {
                headers: {
                    'User-Agent': USER_AGENT_CONNECTMOBILE,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            this.logger.debug(
                '🔄 Exchange response keys:',
                Object.keys(response).join(', ')
            );
            this.oauth2Token = this.setOauth2TokenExpiresAt(response);
            this.logger.debug(
                '✅ OAuth2 token set, expires in:',
                response.expires_in,
                'seconds'
            );
        } catch (error) {
            this.logger.error(
                '❌ Exchange failed:',
                error instanceof Error ? error.message : error
            );
            throw error;
        }
    }

    setOauth2TokenExpiresAt(token: IOauth2Token): IOauth2Token {
        token['last_update_date'] = DateTime.now().toLocal().toString();
        token['expires_date'] = DateTime.fromSeconds(
            DateTime.now().toSeconds() + token['expires_in']
        )
            .toLocal()
            .toString();
        token['expires_at'] = DateTime.now().toSeconds() + token['expires_in'];
        token['refresh_token_expires_at'] =
            DateTime.now().toSeconds() + token['refresh_token_expires_in'];
        this.oauth2Token = token;
        this.saveTokens().catch(() => {});
        return token;
    }
}
