import { getRedisClient } from "@/lib/redis";
import z from "zod";
import type Redis from "ioredis";

const message = z.object({
  id: z.string(),
  sender: z.string(),
  replyTo: z.optional(z.string()),
  text: z.string(),
  timestamp: z.number(),
  roomId: z.string(),
  token: z.string().optional(),
  encrypted: z.boolean().optional(), // Indicates if message text is encrypted
});

const schema = {
  chat: {
    message,
    destroy: z.object({
      isDestroyed: z.literal(true),
    }),
    delete: z.object({
      id: z.string(),
    }),
  },
};

// Custom Realtime implementation using Redis Pub/Sub
class RealtimeChannel {
  private channelName: string;
  private redisClient: Redis;

  constructor(channelName: string, redisClient: Redis) {
    this.channelName = channelName;
    this.redisClient = redisClient;
  }

  async emit<T extends keyof typeof schema.chat>(
    event: `chat.${T}`,
    data: z.infer<(typeof schema.chat)[T]>
  ): Promise<void> {
    const message = JSON.stringify({ event, data });
    await this.redisClient.publish(this.channelName, message);
  }
}

class Realtime {
  private redisClient: Redis;
  private schema: typeof schema;

  constructor(config: { schema: typeof schema }) {
    this.schema = config.schema;
    this.redisClient = getRedisClient();
  }

  channel(channelName: string): RealtimeChannel {
    return new RealtimeChannel(channelName, this.redisClient);
  }

  getSchema() {
    return this.schema;
  }
}

// Type inference for events
type SchemaEvents<T> = T extends { chat: infer U }
  ? {
      [K in keyof U as `chat.${K & string}`]: U[K] extends z.ZodType<infer V>
        ? V
        : never;
    }
  : never;

export type RealtimeEvents = SchemaEvents<typeof schema>;
export type Message = z.infer<typeof message>;

export const realtime = new Realtime({ schema });
