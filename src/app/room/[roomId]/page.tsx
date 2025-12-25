"use client";

import { getUsername } from "@/hooks/use-username";
import { client } from "@/lib/client";
import { useRealtime } from "@/lib/realtime-client";
import {
  IconLoader,
  IconSend,
  IconTrash,
  IconLock,
  IconArrowForwardUp,
  IconX,
} from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  encryptMessage,
  decryptMessage,
  isEncryptionSupported,
} from "@/lib/crypto";

function formatTimeRemaining(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// Helper hook to decrypt messages
function useDecryptedMessages(
  messages: any[] | undefined,
  roomId: string,
  encryptionEnabled: boolean
) {
  const [decryptedMessages, setDecryptedMessages] = useState<any[]>([]);

  useEffect(() => {
    if (!messages || !encryptionEnabled) {
      setDecryptedMessages(messages || []);
      return;
    }

    const decryptAll = async () => {
      const decrypted = await Promise.all(
        messages.map(async (msg) => {
          if (msg.encrypted) {
            const decryptedText = await decryptMessage(msg.text, roomId);
            return { ...msg, text: decryptedText };
          }
          return msg;
        })
      );
      setDecryptedMessages(decrypted);
    };

    decryptAll();
  }, [messages, roomId, encryptionEnabled]);

  return decryptedMessages;
}

const Page = () => {
  const params = useParams();
  const roomId = params.roomId as string;

  const router = useRouter();

  const username = getUsername();
  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState<{
    id: string;
    text: string;
    senderName: string;
  } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [encryptionEnabled, setEncryptionEnabled] = useState(false);

  // Auto-resize textarea based on content
  const adjustTextareaHeight = () => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const scrollHeight = textarea.scrollHeight;
      // Max height is 144px (max-h-36 = 36*4px = 144px)
      textarea.style.height = Math.min(scrollHeight, 144) + "px";
    }
  };

  // Adjust height when input changes
  useEffect(() => {
    adjustTextareaHeight();
  }, [input]);

  const [copyStatus, setCopyStatus] = useState("COPY");

  // Check if encryption is supported
  useEffect(() => {
    setEncryptionEnabled(isEncryptionSupported());
  }, []);
  const { data: ttlData } = useQuery({
    queryKey: ["ttl", roomId],
    queryFn: async () => {
      const res = await client.room.ttl.get({ query: { roomId } });
      return res.data;
    },
  });

  const { data: isSudo } = useQuery({
    queryKey: ["sudo", roomId],
    queryFn: async () => {
      const res = await client.room.sudo.get({ query: { roomId } });
      console.log("sudo", res.data);
      return res.data;
    },
  });

  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (ttlData?.ttl !== undefined && countdown === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCountdown(ttlData.ttl);
    }
  }, [ttlData, countdown]);

  useEffect(() => {
    if (countdown === null || countdown < 0) return;

    if (countdown === 0) {
      router.push("/?destroyed=true");
      return;
    }

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [countdown, router]);

  const { data: messages, refetch } = useQuery({
    queryKey: ["messages", roomId],
    queryFn: async () => {
      const res = await client.messages.get({ query: { roomId } });
      return res.data;
    },
  });

  // Decrypt messages if encryption is enabled
  const decryptedMessages = useDecryptedMessages(
    messages?.messages,
    roomId,
    encryptionEnabled
  );

  const { mutate: sendMessage, isPending } = useMutation({
    mutationFn: async ({
      text,
      replyTo,
    }: {
      text: string;
      replyTo: string | null;
    }) => {
      // Encrypt the message before sending if encryption is enabled
      const messageText = encryptionEnabled
        ? await encryptMessage(text, roomId)
        : text;

      if (replyTo) {
        await client.messages.post(
          { sender: username!, text: messageText, replyTo },
          { query: { roomId } }
        );
      } else {
        await client.messages.post(
          { sender: username!, text: messageText },
          { query: { roomId } }
        );
      }

      setInput("");
    },
  });

  useRealtime({
    channels: [roomId],
    events: ["chat.message", "chat.destroy", "chat.delete"],
    onData: ({ event }) => {
      if (event === "chat.message") {
        refetch();
      }

      if (event === "chat.destroy") {
        router.push("/?destroyed=true");
      }

      if (event === "chat.delete") {
        refetch();
      }
    },
  });

  const { mutate: destroyRoom } = useMutation({
    mutationFn: async () => {
      await client.room.delete(null, { query: { roomId } });
    },
  });

  const { mutate: deleteMessage } = useMutation({
    mutationFn: async (id: string) => {
      await client.messages.delete({ id }, { query: { roomId } });
    },
  });

  const copyLink = () => {
    navigator.clipboard.writeText(roomId);
    setCopyStatus("COPIED!");
    setTimeout(() => setCopyStatus("COPY"), 2000);
  };

  return (
    <main className="flex flex-col h-screen overflow-hidden w-screen">
      <header className="border-b border-zinc-800 p-4 flex items-center justify-between bg-zinc-900/30">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <div className="flex gap-2 items-center">
              <span className="text-xs text-zinc-500 uppercase">Room ID</span>
              <span
                className={`text-sm font-bold flex items-center gap-2 ${
                  countdown !== null && countdown < 60
                    ? "text-red-500"
                    : "text-amber-500"
                }`}>
                {countdown !== null ? formatTimeRemaining(countdown) : "--:--"}{" "}
              </span>
              <IconLock
                className={`w-4 h-4 ${
                  encryptionEnabled ? "text-green-500" : "text-zinc-600"
                }`}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold ellipse">{roomId}</span>
              <button
                onClick={copyLink}
                className="text-[10px] bg-zinc-800 active:bg-zinc-700 px-2 py-0.5 rounded text-zinc-400 active:text-zinc-200 transition-colors">
                {copyStatus}
              </button>
            </div>
          </div>
        </div>

        {isSudo && isSudo.owner && (
          <button
            onClick={() => destroyRoom()}
            className="text-md border-2 border-zinc-800 active:bg-red-600 active:border-red-600 p-2 px-3 rounded text-zinc-400 active:text-white font-bold transition-all group flex items-center gap-2 disabled:opacity-50 cursor-pointer">
            💣
          </button>
        )}
      </header>

      {/* MESSAGES */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
        {decryptedMessages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-zinc-600 text-sm font-mono">No messages yet.</p>
          </div>
        )}

        {decryptedMessages.map((msg) => {
          // Find the original message being replied to
          const repliedMessage = msg.replyTo
            ? decryptedMessages.find((m) => m.id === msg.replyTo)
            : null;

          return (
            <div key={msg.id} className="flex flex-col w-full">
              <div className="flex mb-1 items-center justify-between w-full">
                <div className="flex gap-2 items-center">
                  <span
                    className={`text-sm font-bold ${
                      msg.sender === username
                        ? "text-green-500"
                        : "text-blue-500"
                    }`}>
                    {msg.sender}
                  </span>
                  <span className="text-xs text-zinc-400">
                    {format(msg.timestamp, "HH:mm")}
                  </span>
                </div>
                <div className="flex gap-2 items-center">
                  {isSudo && isSudo.owner && (
                    <button onClick={() => deleteMessage(msg.id)}>
                      <IconTrash className="w-5 h-5 text-zinc-500 active:text-zinc-300 cursor-pointer" />
                    </button>
                  )}
                  <button
                    onClick={() =>
                      setReplyTo({
                        id: msg.id,
                        text: msg.text,
                        senderName: msg.sender,
                      })
                    }>
                    <IconArrowForwardUp className="w-5 h-5 text-zinc-500 active:text-zinc-300 cursor-pointer" />
                  </button>
                </div>
              </div>

              {/* WhatsApp-style reply indicator */}
              {repliedMessage && (
                <div className="mb-2 pl-3 border-l-2 border-blue-500 bg-zinc-800/50 py-1.5 pr-2">
                  <span
                    className={`text-xs font-semibold ${
                      repliedMessage.sender === username
                        ? "text-green-400"
                        : "text-blue-400"
                    }`}>
                    {repliedMessage.sender}
                  </span>
                  <p className="text-xs text-zinc-400 line-clamp-1 text-ellipsis">
                    {repliedMessage.text}
                  </p>
                </div>
              )}

              <p className="text-sm text-zinc-300">{msg.text}</p>
            </div>
          );
        })}
      </div>

      <div className="p-2">
        <div className="flex items-end gap-2">
          <div className="flex-1 relative group w-full bg-black border rounded-md border-zinc-600 focus:border-zinc-500 focus:outline-none transition-colors px-3 py-2 min-h-6 h-fit">
            {replyTo && (
              <div className="mb-3 animate-in fade-in fade-out slide-out-to-top-10 slide-in-from-bottom-10 flex items-center justify-between">
                <div>
                  <div className="flex gap-2 items-center">
                    <IconArrowForwardUp className="w-5 h-5 text-zinc-500" />
                    {replyTo.senderName}
                  </div>
                  <p className="text-sm text-zinc-300 text-ellipsis max-w-full line-clamp-1">
                    {replyTo.text}
                  </p>
                </div>
                <button className="mr-2" onClick={() => setReplyTo(null)}>
                  <IconX className="w-5 h-5 text-zinc-500 active:text-zinc-300 cursor-pointer" />
                </button>
              </div>
            )}
            <textarea
              ref={inputRef}
              autoFocus
              value={input}
              onKeyDown={(e) => {
                // Send message on Enter (without Shift)
                if (e.key === "Enter" && !e.shiftKey && input.trim()) {
                  e.preventDefault();
                  sendMessage({ text: input, replyTo: replyTo?.id! });
                  inputRef.current?.focus();
                }
                // Shift+Enter creates a new line (default behavior)
              }}
              placeholder="Message"
              cols={1}
              onChange={(e) => setInput(e.target.value)}
              className="outline-none border-none text-zinc-100 placeholder:text-zinc-400 text-md resize-none appearance-none h-full max-h-36 w-full overflow-y-auto border border-zinc-200"
            />
          </div>

          <button
            onClick={() => {
              sendMessage({ text: input, replyTo: replyTo?.id! });
              inputRef.current?.focus();
            }}
            disabled={!input.trim() || isPending}
            className="text-zinc-400 py-4 px-2 text-sm font-bold active:text-zinc-200 transition-all disabled:cursor-not-allowed cursor-pointer flex gap-2 items-center justify-center rounded-full">
            {isPending ? (
              <IconLoader className="animate-spin w-5 h-5" />
            ) : (
              <IconSend className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </main>
  );
};

export default Page;
