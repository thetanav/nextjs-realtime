"use client";

import { useEffect, useRef } from "react";
import type { RealtimeEvents } from "./realtime";

interface UseRealtimeOptions<T extends keyof RealtimeEvents> {
  channels: string[];
  events: T[];
  onData: (data: { event: T; data: RealtimeEvents[T] }) => void;
}

export function useRealtime<T extends keyof RealtimeEvents>(
  options: UseRealtimeOptions<T>
) {
  const { channels, events, onData } = options;
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (channels.length === 0) return;

    // Create EventSource connection to the realtime API
    const channelParam = channels.join(",");
    const eventsParam = events.join(",");
    const url = `/api/realtime?channels=${encodeURIComponent(
      channelParam
    )}&events=${encodeURIComponent(eventsParam)}`;

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const parsedData = JSON.parse(event.data);
        onData(parsedData);
      } catch (error) {
        console.error("Error parsing realtime message:", error);
      }
    };

    eventSource.onerror = (error) => {
      console.error("EventSource error:", error);
      eventSource.close();
    };

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [channels, events, onData]);
}