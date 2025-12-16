import Redis from "ioredis";

// Singleton pattern for Redis connection pooling
class RedisClient {
  private static instance: Redis | null = null;

  static getInstance(): Redis {
    if (!RedisClient.instance) {
      const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
      
      RedisClient.instance = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        enableOfflineQueue: true,
        lazyConnect: false,
        // Connection pool optimization
        connectionName: "nextjs-realtime",
        // Performance tuning
        keepAlive: 30000,
        connectTimeout: 10000,
        // Retry strategy
        retryStrategy(times: number) {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        // Reconnect on error
        reconnectOnError(err: Error) {
          const targetError = "READONLY";
          if (err.message.includes(targetError)) {
            return true;
          }
          return false;
        },
      });

      // Handle connection events
      RedisClient.instance.on("error", (err: Error) => {
        console.error("Redis connection error:", err);
      });

      RedisClient.instance.on("connect", () => {
        console.log("Redis connected successfully");
      });

      RedisClient.instance.on("ready", () => {
        console.log("Redis ready to accept commands");
      });
    }

    return RedisClient.instance;
  }

  static async disconnect(): Promise<void> {
    if (RedisClient.instance) {
      await RedisClient.instance.quit();
      RedisClient.instance = null;
    }
  }
}

// Helper class to provide Upstash-like API with optimizations
class OptimizedRedisWrapper {
  private client: Redis;

  constructor(client: Redis) {
    this.client = client;
  }

  // Optimized methods with proper JSON handling
  async hset(key: string, data: Record<string, any>): Promise<number> {
    const pipeline = this.client.pipeline();
    for (const [field, value] of Object.entries(data)) {
      pipeline.hset(key, field, JSON.stringify(value));
    }
    const results = await pipeline.exec();
    return results?.length || 0;
  }

  async hget<T = any>(key: string, field: string): Promise<T | null> {
    const value = await this.client.hget(key, field);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as T;
    }
  }

  async hgetall<T = any>(key: string): Promise<T | null> {
    const values = await this.client.hgetall(key);
    if (!values || Object.keys(values).length === 0) return null;
    
    const result: Record<string, any> = {};
    for (const [field, value] of Object.entries(values)) {
      try {
        result[field] = JSON.parse(value);
      } catch {
        result[field] = value;
      }
    }
    return result as T;
  }

  async exists(...keys: string[]): Promise<number> {
    return await this.client.exists(...keys);
  }

  async expire(key: string, seconds: number): Promise<number> {
    return await this.client.expire(key, seconds);
  }

  async ttl(key: string): Promise<number> {
    return await this.client.ttl(key);
  }

  async del(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    return await this.client.del(...keys);
  }

  async rpush(key: string, ...values: any[]): Promise<number> {
    const stringifiedValues = values.map((v) => JSON.stringify(v));
    return await this.client.rpush(key, ...stringifiedValues);
  }

  async lrange<T = any>(key: string, start: number, stop: number): Promise<T[]> {
    const values = await this.client.lrange(key, start, stop);
    return values.map((v: string) => {
      try {
        return JSON.parse(v) as T;
      } catch {
        return v as T;
      }
    });
  }

  // Optimized batch operations
  async multiHset(operations: Array<{ key: string; data: Record<string, any> }>): Promise<void> {
    const pipeline = this.client.pipeline();
    for (const { key, data } of operations) {
      for (const [field, value] of Object.entries(data)) {
        pipeline.hset(key, field, JSON.stringify(value));
      }
    }
    await pipeline.exec();
  }

  async multiExpire(operations: Array<{ key: string; seconds: number }>): Promise<void> {
    const pipeline = this.client.pipeline();
    for (const { key, seconds } of operations) {
      pipeline.expire(key, seconds);
    }
    await pipeline.exec();
  }

  async multiDel(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const pipeline = this.client.pipeline();
    for (const key of keys) {
      pipeline.del(key);
    }
    await pipeline.exec();
  }

  // Pub/Sub for realtime functionality
  async publish(channel: string, message: string): Promise<number> {
    return await this.client.publish(channel, message);
  }

  subscribe(channel: string, callback: (message: string) => void): Redis {
    const subscriber = this.client.duplicate();
    subscriber.subscribe(channel);
    subscriber.on("message", (_channel: string, message: string) => {
      if (_channel === channel) {
        callback(message);
      }
    });
    return subscriber;
  }

  // Get raw client for advanced operations
  getClient(): Redis {
    return this.client;
  }
}

export const redis = new OptimizedRedisWrapper(RedisClient.getInstance());
export const getRedisClient = () => RedisClient.getInstance();
