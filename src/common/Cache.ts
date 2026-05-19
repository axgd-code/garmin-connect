/**
 * Generic cache implementation with TTL (Time To Live) support
 */
export class Cache<T> {
    private cache: Map<string, { data: T; timestamp: number }> = new Map();
    private readonly ttl: number;

    /**
     * @param ttl Time to live in milliseconds
     */
    constructor(ttl: number) {
        this.ttl = ttl;
    }

    /**
     * Get a value from the cache
     * @param key Cache key
     * @returns Cached value or undefined if expired or not found
     */
    get(key: string): T | undefined {
        const cached = this.cache.get(key);

        if (!cached) {
            return undefined;
        }

        // Check if expired
        if (Date.now() - cached.timestamp >= this.ttl) {
            this.cache.delete(key);
            return undefined;
        }

        return cached.data;
    }

    /**
     * Set a value in the cache
     * @param key Cache key
     * @param data Data to cache
     */
    set(key: string, data: T): void {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    /**
     * Check if a key exists and is not expired
     * @param key Cache key
     * @returns true if key exists and is valid
     */
    has(key: string): boolean {
        return this.get(key) !== undefined;
    }

    /**
     * Clear a specific key from the cache
     * @param key Cache key
     */
    delete(key: string): void {
        this.cache.delete(key);
    }

    /**
     * Clear all cached data
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * Get the number of items in the cache (including expired items)
     */
    size(): number {
        return this.cache.size;
    }

    /**
     * Remove all expired items from the cache
     */
    prune(): void {
        const now = Date.now();
        for (const [key, value] of this.cache.entries()) {
            if (now - value.timestamp >= this.ttl) {
                this.cache.delete(key);
            }
        }
    }
}
