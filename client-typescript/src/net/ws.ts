import WebSocket from 'ws';
import { EventEmitter } from 'events';

interface ClientConfig {
  url: string;
  participantId: string;
  nickname: string;
  pin: string;
  runner: string;
  model: string;
}

interface Challenge {
  type: 'challenge';
  session_id: string;
  round: number;
  prompt: string;
  max_tokens: number;
  temperature: number;
  deadline_ms: number;
  seed?: number;
}

interface TokenMessage {
  round: number;
  seq: number;
  content: string;
}

interface CompleteMessage {
  round: number;
  tokens: number;
  latency_ms_first_token?: number;
  duration_ms: number;
  model_info?: {
    name: string;
    runner: string;
    device?: string;
  };
}

interface ErrorMessage {
  round: number;
  code: string;
  message: string;
}

export class GambiarraClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 15;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000; // Cap backoff at 30s

  constructor(private config: ClientConfig) {
    super();
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.config.url);

      this.ws.on('open', () => {
        this.reconnectAttempts = 0;

        // Send registration
        this.send({
          type: 'register',
          participant_id: this.config.participantId,
          nickname: this.config.nickname,
          pin: this.config.pin,
          runner: this.config.runner,
          model: this.config.model,
        });

        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (err) {
          console.error('Failed to parse message:', err);
        }
      });

      this.ws.on('close', () => {
        this.emit('close');
        this.attemptReconnect();
      });

      this.ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      });
    });
  }

  private handleMessage(message: any) {
    switch (message.type) {
      case 'challenge':
        this.emit('challenge', message as Challenge);
        break;
      case 'heartbeat':
        // Respond to heartbeat if needed
        break;
      case 'registered':
        this.emit('registered', message);
        break;
      case 'error':
        console.error('Server error:', message.message);
        break;
      default:
        console.warn('Unknown message type:', message.type);
    }
  }

  sendToken(data: TokenMessage) {
    this.send({
      type: 'token',
      round: data.round,
      participant_id: this.config.participantId,
      seq: data.seq,
      content: data.content,
    });
  }

  sendComplete(data: CompleteMessage) {
    this.send({
      type: 'complete',
      round: data.round,
      participant_id: this.config.participantId,
      tokens: data.tokens,
      latency_ms_first_token: data.latency_ms_first_token,
      duration_ms: data.duration_ms,
      model_info: data.model_info,
    });
  }

  sendError(data: ErrorMessage) {
    this.send({
      type: 'error',
      round: data.round,
      participant_id: this.config.participantId,
      code: data.code,
      message: data.message,
    });
  }

  private send(data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`Max reconnection attempts (${this.maxReconnectAttempts}) reached — giving up`);
      this.emit('reconnect_failed');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    this.emit('reconnecting', {
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
      delayMs: delay,
    });

    setTimeout(() => {
      this.connect().catch((err) => {
        console.error('Reconnection failed:', err);
      });
    }, delay);
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
