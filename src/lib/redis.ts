import { Redis } from "@upstash/redis";

// Initialize Upstash Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Helper class to match the previous API
class RedisWrapper {
  private client: Redis;

  constructor(client: Redis) {
    this.client = client;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async hset(key: string, data: Record<string, any>): Promise<number> {
    await this.client.hset(key, data);
    return Object.keys(data).length;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async hget<T = any>(key: string, field: string): Promise<T | null> {
    return await this.client.hget<T>(key, field);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async hgetall<T = any>(key: string): Promise<T | null> {
    const result = await this.client.hgetall(key);
    if (!result || Object.keys(result).length === 0) return null;
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async rpush(key: string, ...values: any[]): Promise<number> {
    return await this.client.rpush(key, ...values);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async lrange<T = any>(
    key: string,
    start: number,
    stop: number
  ): Promise<T[]> {
    return await this.client.lrange<T>(key, start, stop);
  }

  async ltrim(key: string, start: number, stop: number): Promise<string> {
    return await this.client.ltrim(key, start, stop);
  }

  // Optimized batch operations using pipeline
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async multiHset(
    operations: Array<{ key: string; data: Record<string, any> }>
  ): Promise<void> {
    const pipeline = this.client.pipeline();
    for (const { key, data } of operations) {
      pipeline.hset(key, data);
    }
    await pipeline.exec();
  }

  async multiExpire(
    operations: Array<{ key: string; seconds: number }>
  ): Promise<void> {
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

  // Remove message by ID from a list (searches for JSON with matching id field)
  async lremByMessageId(key: string, messageId: string): Promise<number> {
    const messages = await this.lrange<{ id: string }>(key, 0, -1);
    const updatedMessages = messages.filter((m) => m.id !== messageId);

    if (updatedMessages.length === messages.length) {
      return 0; // No message found
    }

    // Delete the entire list and repush filtered messages
    await this.client.del(key);
    if (updatedMessages.length > 0) {
      await this.client.rpush(key, ...updatedMessages);
    }

    return messages.length - updatedMessages.length;
  }

  // Get raw client for advanced operations
  getClient(): Redis {
    return this.client;
  }
}

export { redis as upstashRedis };
export const wrappedRedis = new RedisWrapper(redis);
export { wrappedRedis as redis };
