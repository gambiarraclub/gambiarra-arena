import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { PrismaClient } from '@prisma/client';
import { WebSocketHub } from './ws/hub.js';
import { RoundManager } from './core/rounds.js';
import { VoteManager } from './core/votes.js';
import { MetricsManager } from './core/metrics.js';
import { EventLogger } from './core/eventlog.js';
import { setupRoutes } from './http/routes.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';

const app = Fastify({
  logger: {
    level: NODE_ENV === 'development' ? 'debug' : 'info',
    transport:
      NODE_ENV === 'development'
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
  },
  requestIdLogLabel: 'reqId',
  disableRequestLogging: false,
  requestIdHeader: 'x-request-id',
  trustProxy: true, // Trust X-Forwarded-For headers
});

// Database
const prisma = new PrismaClient({
  log: NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// Make Prisma available in routes
app.decorate('prisma', prisma);

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

// CORS
await app.register(cors, {
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
});

// Rate limiting
await app.register(rateLimit, {
  max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  timeWindow: parseInt(process.env.RATE_LIMIT_TIME_WINDOW || '60000', 10),
});

// WebSocket
await app.register(websocket, {
  options: {
    perMessageDeflate: process.env.WS_COMPRESSION === 'true',
    maxPayload: parseInt(process.env.WS_MAX_PAYLOAD || '1048576', 10),
  },
});

// Initialize managers
const eventLogger = new EventLogger(prisma, app.log);
const hub = new WebSocketHub(prisma, app.log, eventLogger);
const roundManager = new RoundManager(prisma, hub, app.log, eventLogger);
const voteManager = new VoteManager(prisma, app.log, eventLogger);
const metricsManager = new MetricsManager(prisma);

// WebSocket route
app.register(async (app) => {
  app.get('/ws', { websocket: true }, (socket, request) => {
    hub.handleConnection(socket);
  });
});

// HTTP routes
await setupRoutes(app, hub, roundManager, voteManager, metricsManager, eventLogger);

// Graceful shutdown
const shutdown = async () => {
  app.log.info('Shutting down gracefully...');
  hub.cleanup();
  await prisma.$disconnect();
  await app.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start server
try {
  await app.listen({ port: PORT, host: HOST });

  app.log.info(`
╔═══════════════════════════════════════════════════════╗
║  🎮 Gambiarra LLM Club Arena Local                   ║
║  Server running on http://${HOST}:${PORT}      ║
║  WebSocket: ws://${HOST}:${PORT}/ws              ║
╚═══════════════════════════════════════════════════════╝
  `);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
