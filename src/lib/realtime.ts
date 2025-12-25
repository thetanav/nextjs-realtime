import { upstashRedis } from "@/lib/redis";
import z from "zod";

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

// Simplified Realtime implementation using Upstash Redis Pub/Sub
class RealtimeChannel {
  private channelName: string;

  constructor(channelName: string) {
    this.channelName = channelName;
  }

  async emit<T extends keyof typeof schema.chat>(
    event: `chat.${T}`,
    data: z.infer<(typeof schema.chat)[T]>
  ): Promise<void> {
    const timestamp = Date.now();
    const message = { event, data, timestamp };
    
    // Store message in Redis list for polling
    const messagesKey = `realtime:${this.channelName}`;
    await upstashRedis.rpush(messagesKey, message);
    
    // Keep only last 100 messages to avoid unbounded growth
    await upstashRedis.ltrim(messagesKey, -100, -1);
    
    // Set expiry on the messages list (30 minutes)
    await upstashRedis.expire(messagesKey, 1800);
  }
}

class Realtime {
  private schema: typeof schema;

  constructor(config: { schema: typeof schema }) {
    this.schema = config.schema;
  }

  channel(channelName: string): RealtimeChannel {
    return new RealtimeChannel(channelName);
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
