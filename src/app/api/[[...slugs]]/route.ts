import { redis } from "@/lib/redis";
import { Elysia } from "elysia";
import { nanoid } from "nanoid";
import { authMiddleware } from "./auth";
import { z } from "zod";
import { Message, realtime } from "@/lib/realtime";

const ROOM_TTL_SECONDS = 10 * 60;

const rooms = new Elysia({
  prefix: "/room",
})
  .post("/create", async ({ cookie }) => {
    const roomId = nanoid();
    const ownerToken = "c-" + nanoid();

    cookie["x-auth-token"].set({
      value: ownerToken,
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    await redis.hset(`meta:${roomId}`, {
      owner: ownerToken,
      connected: [ownerToken],
      createdAt: Date.now(),
    });

    await redis.expire(`meta:${roomId}`, ROOM_TTL_SECONDS);

    return { roomId, ownerToken };
  })
  .post(
    "/join",
    async ({ body, cookie }) => {
      const { roomId } = body;

      // Check if room exists
      const roomExists = await redis.exists(`meta:${roomId}`);
      if (!roomExists) {
        throw new Error("Room not found");
      }

      const userToken = "u-" + nanoid();

      cookie["x-auth-token"].set({
        value: userToken,
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      });

      const currentConnected =
        (await redis.hget<string[]>(`meta:${roomId}`, "connected")) || [];
      const updatedConnected = [...currentConnected, userToken];

      await redis.hset(`meta:${roomId}`, {
        connected: updatedConnected,
      });

      return { success: true, roomId, userToken };
    },
    {
      body: z.object({
        roomId: z.string(),
      }),
    }
  );

const authenticatedRooms = new Elysia({ prefix: "/room" })
  .use(authMiddleware)
  .get(
    "/sudo",
    async ({ auth }) => {
      const meta = await redis.hget(`meta:${auth.roomId}`, "owner");
      if (auth.token == meta) return { owner: true };
      return { owner: false };
    },
    { query: z.object({ roomId: z.string() }) }
  )
  .get(
    "/ttl",
    async ({ auth }) => {
      const ttl = await redis.ttl(`meta:${auth.roomId}`);
      return { ttl: ttl > 0 ? ttl : 0 };
    },
    { query: z.object({ roomId: z.string() }) }
  )
  .delete(
    "/",
    async ({ auth }) => {
      const owner = await redis.hget(`meta:${auth.roomId}`, "owner");

      if (auth.token !== owner) return;
      await realtime
        .channel(auth.roomId)
        .emit("chat.destroy", { isDestroyed: true });

      // Optimized batch delete
      await redis.multiDel([
        auth.roomId,
        `meta:${auth.roomId}`,
        `messages:${auth.roomId}`,
      ]);
    },
    { query: z.object({ roomId: z.string() }) }
  );

const messages = new Elysia({ prefix: "/messages" })
  .use(authMiddleware)
  .post(
    "/",
    async ({ body, auth }) => {
      const { sender, text } = body;
      const { roomId } = auth;

      const roomExists = await redis.exists(`meta:${roomId}`);

      if (!roomExists) {
        throw new Error("Room does not exist");
      }

      const message: Message = {
        id: nanoid(),
        sender,
        text,
        timestamp: Date.now(),
        roomId,
      };

      // add message to history
      await redis.rpush(`messages:${roomId}`, {
        ...message,
        token: auth.token,
      });
      await realtime.channel(roomId).emit("chat.message", message);

      // housekeeping - optimized with batch expire
      const remaining = await redis.ttl(`meta:${roomId}`);

      await redis.multiExpire([
        { key: `messages:${roomId}`, seconds: remaining },
        { key: `history:${roomId}`, seconds: remaining },
        { key: roomId, seconds: remaining },
      ]);
    },
    {
      query: z.object({ roomId: z.string() }),
      body: z.object({
        sender: z.string().max(100),
        text: z.string().max(1000),
      }),
    }
  )
  .get(
    "/",
    async ({ auth }) => {
      const messages = await redis.lrange<Message>(
        `messages:${auth.roomId}`,
        0,
        -1
      );

      return {
        messages: messages.map((m) => ({
          ...m,
          token: m.token === auth.token ? auth.token : undefined,
        })),
      };
    },
    { query: z.object({ roomId: z.string() }) }
  )
  .delete(
    "/",
    async ({ body, auth }) => {
      const { id } = body;

      const meta = await redis.hget(`meta:${auth.roomId}`, "owner");

      if (meta != auth.token) return { error: "Unauthorized" };

      // delete message from redis with id and roomId
      await redis.del(`messages:${auth.roomId}`, id);

      await realtime.channel(auth.roomId).emit("chat.delete", { id });

      return { success: true };
    },
    {
      body: z.object({
        id: z.string(),
      }),
      query: z.object({ roomId: z.string() }),
    }
  );

const app = new Elysia({ prefix: "/api" })
  .use(rooms)
  .use(authenticatedRooms)
  .use(messages);

export const GET = app.fetch;
export const POST = app.fetch;
export const DELETE = app.fetch;

export type App = typeof app;
