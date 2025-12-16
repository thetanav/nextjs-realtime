import { getRedisClient } from "@/lib/redis";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const channelsParam = searchParams.get("channels");
  const eventsParam = searchParams.get("events");

  if (!channelsParam || !eventsParam) {
    return new Response("Missing channels or events parameter", {
      status: 400,
    });
  }

  const channels = channelsParam.split(",");
  const events = eventsParam.split(",");

  // Create a readable stream for Server-Sent Events
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const redisClient = getRedisClient();
      const subscriber = redisClient.duplicate();

      try {
        await subscriber.subscribe(...channels);

        subscriber.on("message", (_channel: string, message: string) => {
          try {
            const parsed = JSON.parse(message);
            // Filter by requested events
            if (events.includes(parsed.event)) {
              const data = `data: ${JSON.stringify(parsed)}\n\n`;
              controller.enqueue(encoder.encode(data));
            }
          } catch (error) {
            console.error("Error processing message:", error);
          }
        });

        // Send keepalive ping every 30 seconds
        const keepAliveInterval = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": keepalive\n\n"));
          } catch {
            clearInterval(keepAliveInterval);
          }
        }, 30000);

        // Handle client disconnect
        request.signal.addEventListener("abort", async () => {
          clearInterval(keepAliveInterval);
          await subscriber.unsubscribe(...channels);
          await subscriber.quit();
          controller.close();
        });
      } catch (error) {
        console.error("Redis subscription error:", error);
        await subscriber.quit();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}