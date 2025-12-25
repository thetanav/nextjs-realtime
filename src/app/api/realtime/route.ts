import { upstashRedis } from "@/lib/redis";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const channelsParam = searchParams.get("channels");
  const eventsParam = searchParams.get("events");
  const lastTimestamp = searchParams.get("lastTimestamp") || "0";

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
      try {
        let lastSeenTimestamp = parseInt(lastTimestamp);
        let keepAliveCounter = 0;

        // Poll for new messages every 500ms
        const pollInterval = setInterval(async () => {
          try {
            // Check if connection is still alive
            if (request.signal.aborted) {
              clearInterval(pollInterval);
              controller.close();
              return;
            }

            // Send keepalive every 30 seconds (60 * 500ms)
            keepAliveCounter++;
            if (keepAliveCounter >= 60) {
              controller.enqueue(encoder.encode(": keepalive\n\n"));
              keepAliveCounter = 0;
            }

            // Check each channel for new messages
            for (const channel of channels) {
              const messagesKey = `realtime:${channel}`;
              
              // Get recent messages (last 100)
              const messages = await upstashRedis.lrange<{
                event: string;
                data: unknown;
                timestamp: number;
              }>(messagesKey, -100, -1);

              // Filter messages that are newer than lastSeenTimestamp and match requested events
              const newMessages = messages.filter(
                (msg) =>
                  msg.timestamp > lastSeenTimestamp &&
                  events.includes(msg.event)
              );

              // Send new messages to client
              for (const message of newMessages) {
                const data = `data: ${JSON.stringify({
                  event: message.event,
                  data: message.data,
                })}\n\n`;
                controller.enqueue(encoder.encode(data));
                
                // Update last seen timestamp
                if (message.timestamp > lastSeenTimestamp) {
                  lastSeenTimestamp = message.timestamp;
                }
              }
            }
          } catch (error) {
            console.error("Error polling for messages:", error);
          }
        }, 500);

        // Handle client disconnect
        request.signal.addEventListener("abort", () => {
          clearInterval(pollInterval);
          controller.close();
        });
      } catch (error) {
        console.error("Redis subscription error:", error);
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