import Redis from 'ioredis';

import type { BaseEvent } from '@ai-career-os/types';
import type { Logger } from 'pino';

type EventHandler<T = unknown> = (event: BaseEvent<T>) => Promise<void>;

/**
 * Event bus abstraction using Redis Pub/Sub.
 * Provides a clean publish/subscribe interface.
 *
 * Future: Replace Redis pub/sub with Kafka for durable event streaming.
 * The interface remains the same — only the transport changes.
 */
export class EventBus {
  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;
  private readonly handlers: Map<string, EventHandler[]> = new Map();
  private readonly logger: Logger;

  constructor(
    private readonly config: {
      host: string;
      port: number;
      password?: string;
    },
    logger: Logger,
  ) {
    this.logger = logger.child({ component: 'EventBus' });
  }

  /**
   * Initialize publisher and subscriber connections.
   */
  async connect(): Promise<void> {
    const redisOptions = {
      host: this.config.host,
      port: this.config.port,
      password: this.config.password,
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        return Math.min(times * 200, 5000);
      },
    };

    this.publisher = new Redis(redisOptions);
    this.subscriber = new Redis(redisOptions);

    this.subscriber.on('message', (channel: string, message: string) => {
      void this.handleMessage(channel, message);
    });

    this.logger.info('EventBus connected');
  }

  /**
   * Publish an event to a topic.
   */
  async publish<T>(topic: string, event: BaseEvent<T>): Promise<void> {
    if (!this.publisher) {
      throw new Error('EventBus not connected. Call connect() first.');
    }

    const serialized = JSON.stringify(event);
    await this.publisher.publish(topic, serialized);

    this.logger.debug(
      { topic, eventId: event.eventId, eventType: event.eventType },
      'Event published',
    );
  }

  /**
   * Subscribe to a topic with a handler.
   */
  async subscribe<T>(topic: string, handler: EventHandler<T>): Promise<void> {
    if (!this.subscriber) {
      throw new Error('EventBus not connected. Call connect() first.');
    }

    const existing = this.handlers.get(topic) ?? [];
    existing.push(handler as EventHandler);
    this.handlers.set(topic, existing);

    await this.subscriber.subscribe(topic);
    this.logger.info({ topic }, 'Subscribed to topic');
  }

  /**
   * Handle incoming messages.
   */
  private async handleMessage(channel: string, message: string): Promise<void> {
    const handlers = this.handlers.get(channel);
    if (!handlers?.length) {
      return;
    }

    try {
      const event = JSON.parse(message) as BaseEvent;
      await Promise.all(handlers.map((handler) => handler(event)));
    } catch (err) {
      this.logger.error({ err, channel }, 'Failed to process event');
    }
  }

  /**
   * Gracefully disconnect.
   */
  async disconnect(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = null;
    }
    if (this.publisher) {
      await this.publisher.quit();
      this.publisher = null;
    }
    this.handlers.clear();
    this.logger.info('EventBus disconnected');
  }
}
