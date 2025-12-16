# nextjs-realtime

A real-time chat application built with Next.js and Redis Pub/Sub.

## Features

- Real-time messaging with Server-Sent Events (SSE)
- Self-destructing chat rooms with automatic expiration
- Optimized Redis operations with connection pooling and pipelining
- Room management with owner privileges

## Prerequisites

- Node.js 18+ or Bun
- Redis server (local or remote)

## Installation

1. Clone the repository and install dependencies:

```bash
bun install
# or
npm install
```

2. Configure your environment variables:

Copy `.env.example` to `.env` and update with your Redis URL:

```bash
cp .env.example .env
```

Update the `.env` file:

```env
REDIS_URL=redis://localhost:6379
```

For Redis with authentication:

```env
REDIS_URL=redis://:your-password@localhost:6379
```

3. Start the development server:

```bash
bun dev
# or
npm run dev
```

## Architecture

### Redis Optimizations

The application implements several Redis optimizations:

1. **Connection Pooling**: Singleton pattern ensures efficient connection reuse
2. **Pipelining**: Batch operations are executed using Redis pipelines
3. **Pub/Sub**: Real-time updates use Redis Pub/Sub with Server-Sent Events
4. **Automatic Serialization**: JSON data is automatically serialized/deserialized

### Key Components

- **src/lib/redis.ts**: Optimized Redis wrapper with connection pooling
- **src/lib/realtime.ts**: Custom real-time implementation using Redis Pub/Sub
- **src/lib/realtime-client.ts**: Client-side SSE consumer
- **src/app/api/realtime/route.ts**: SSE endpoint for real-time updates

## API Routes

- `POST /api/room/create` - Create a new chat room
- `POST /api/room/join` - Join an existing room
- `GET /api/room/sudo` - Check owner privileges
- `GET /api/room/ttl` - Get room expiration time
- `DELETE /api/room` - Destroy a room (owner only)
- `POST /api/messages` - Send a message
- `GET /api/messages` - Get all messages in a room
- `DELETE /api/messages` - Delete a message (owner only)
- `GET /api/realtime` - SSE endpoint for real-time updates

## Performance Features

1. **Batch Operations**: Multiple Redis commands are executed in a single pipeline
2. **Connection Reuse**: Single Redis connection is reused across all requests
3. **Optimized JSON Handling**: Automatic serialization/deserialization
4. **Keep-Alive**: SSE connections use keep-alive to prevent timeouts
5. **Error Recovery**: Automatic retry logic for failed Redis operations

## Environment Variables

| Variable    | Description          | Default                  |
| ----------- | -------------------- | ------------------------ |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |

## Production Deployment

For production, consider:

1. Use a managed Redis service (AWS ElastiCache, Redis Cloud, etc.)
2. Enable Redis persistence (RDB or AOF)
3. Set up Redis Sentinel or Cluster for high availability
4. Configure proper Redis memory policies
5. Enable TLS for Redis connections

Example production Redis URL:

```env
REDIS_URL=rediss://:password@your-redis-host:6380
```

## License

MIT
