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
import path from 'path';
import fs from 'fs';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Ensure logs directory exists
const logsDir = path.join(import.meta.dirname ?? '.', '..', 'logs');
fs.mkdirSync(logsDir, { recursive: true });

// Generate daily log file path
const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const logFilePath = path.join(logsDir, `server-${today}.log`);

const app = Fastify({
  logger: {
    level: 'info', // Capture info+ for file; console transport filters to warn
    transport: {
      targets: [
        // Console: only warnings and errors, pretty-printed in dev
        ...(NODE_ENV === 'development'
          ? [{
              target: 'pino-pretty',
              level: 'warn' as const,
              options: {
                colorize: true,
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
              },
            }]
          : [{
              target: 'pino/file',
              level: 'warn' as const,
              options: { destination: 1 }, // stdout
            }]),
        // File: everything at info level and above — the forensic record
        {
          target: 'pino/file',
          level: 'info' as const,
          options: {
            destination: logFilePath,
            mkdir: true,
          },
        },
      ],
    },
  },
  requestIdLogLabel: 'reqId',
  disableRequestLogging: false, // Enable HTTP request logging for forensics
  requestIdHeader: 'x-request-id',
  trustProxy: true, // Trust X-Forwarded-For headers
});

// Database
const prisma = new PrismaClient({
  log: ['error'], // Only log errors
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
const rateLimitMax = parseInt(process.env.RATE_LIMIT_MAX || '500', 10);
const rateLimitWindow = parseInt(process.env.RATE_LIMIT_TIME_WINDOW || '60000', 10);
app.log.info({ rateLimitMax, rateLimitWindow, logFilePath }, 'Server config loaded');

await app.register(rateLimit, {
  max: rateLimitMax,
  timeWindow: rateLimitWindow,
  onExceeding: (req, key) => {
    app.log.info(
      { ip: key, method: req.method, url: req.url, rateLimitMax },
      'RATE_LIMIT_APPROACHING: client nearing rate limit'
    );
  },
  onExceeded: (req, key) => {
    app.log.warn(
      { ip: key, method: req.method, url: req.url, rateLimitMax },
      'RATE_LIMIT_EXCEEDED: client blocked with 429 Too Many Requests'
    );
  },
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

// Startup cleanup: Mark all participants as disconnected
// This handles the case where the server crashed or restarted
// and the database still has stale connected=true records
await prisma.participant.updateMany({
  data: { connected: false },
});
app.log.info('Startup: Marked all participants as disconnected');

// Log HTTP responses — critical for diagnosing rate limit issues
app.addHook('onResponse', (request, reply, done) => {
  const statusCode = reply.statusCode;
  // Always log 429s prominently, log other requests at info
  if (statusCode === 429) {
    app.log.warn(
      {
        method: request.method,
        url: request.url,
        statusCode,
        ip: request.ip,
        responseTime: reply.elapsedTime?.toFixed(1),
      },
      'HTTP_429: Request rate-limited'
    );
  } else {
    app.log.info(
      {
        method: request.method,
        url: request.url,
        statusCode,
        ip: request.ip,
        responseTime: reply.elapsedTime?.toFixed(1),
      },
      'HTTP request completed'
    );
  }
  done();
});

// WebSocket route — exempt from rate limiting
app.register(async (app) => {
  app.get('/ws', { websocket: true, config: { rateLimit: false } }, (socket, request) => {
    app.log.info({ ip: request.ip }, 'WS_UPGRADE: WebSocket connection opened');
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

  console.log(`
╔═══════════════════════════════════════════════════════╗
║  🎮 Gambiarra LLM Club Arena Local                   ║
║  Server running on http://${HOST}:${PORT}              ║
║  WebSocket: ws://${HOST}:${PORT}/ws                    ║
╚═══════════════════════════════════════════════════════╝
  `);
} catch (err) {
  console.error('Failed to start server:', err);
  process.exit(1);
}
