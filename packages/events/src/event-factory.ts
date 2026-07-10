import crypto from 'node:crypto';

import type { BaseEvent } from '@ai-career-os/types';

/**
 * Factory to create standardized event payloads.
 * All events in the system must be created through this factory
 * to ensure consistent structure and metadata.
 */
export function createEvent<T>(
  eventType: string,
  source: string,
  payload: T,
  correlationId?: string,
): BaseEvent<T> {
  return {
    eventId: crypto.randomUUID(),
    eventType,
    source,
    timestamp: new Date().toISOString(),
    correlationId: correlationId ?? crypto.randomUUID(),
    version: '1.0.0',
    payload,
  };
}
