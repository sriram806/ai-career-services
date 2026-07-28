import { ErrorFactory } from '@ai-career-os/errors';
import type { FastifyRequest, FastifyReply } from 'fastify';

interface CircuitState {
  failures: number;
  lastFailureTime?: number;
  status: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

// In-memory circuit breakers per downstream microservice
const circuitBreakers: Record<string, CircuitState> = {};
const FAILURE_THRESHOLD = 5;
const COOLDOWN_PERIOD_MS = 30000; // 30 seconds

/**
 * Checks the circuit status of a downstream microservice.
 * Returns true if requests should be allowed, false otherwise.
 */
function checkCircuit(serviceName: string): boolean {
  let state = circuitBreakers[serviceName];
  if (!state) {
    state = { failures: 0, status: 'CLOSED' };
    circuitBreakers[serviceName] = state;
  }

  if (state.status === 'OPEN') {
    if (state.lastFailureTime && Date.now() - state.lastFailureTime > COOLDOWN_PERIOD_MS) {
      state.status = 'HALF_OPEN';
      return true; // Allow one request to probe the system
    }
    return false; // Circuit open, block request
  }
  return true;
}

/**
 * Records a successful response from a downstream microservice.
 */
function recordSuccess(serviceName: string) {
  const state = circuitBreakers[serviceName];
  if (state) {
    state.failures = 0;
    state.status = 'CLOSED';
  }
}

/**
 * Records a failed request to a downstream microservice.
 */
function recordFailure(serviceName: string) {
  let state = circuitBreakers[serviceName];
  if (!state) {
    state = { failures: 0, status: 'CLOSED' };
    circuitBreakers[serviceName] = state;
  }

  state.failures++;
  state.lastFailureTime = Date.now();
  if (state.failures >= FAILURE_THRESHOLD) {
    state.status = 'OPEN';
  }
}

/**
 * Higher-order function returning a route handler that proxies incoming requests
 * to a target downstream microservice URL.
 *
 * Implements:
 * - Connection pooling (via `@fastify/reply-from` undici configuration)
 * - Safe payload body serialization when preHandlers parse JSON bodies
 * - Retries with basic backoff for transient errors
 * - Circuit breaker patterns
 * - Request correlation ID propagation
 * - User authentication context forwarding
 */
export function proxyTo(serviceUrl: string, serviceName: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    // 1. Circuit Breaker Check
    if (!checkCircuit(serviceName)) {
      throw ErrorFactory.externalServiceError(
        serviceName,
        new Error(`Circuit open for service: ${serviceName}`),
      );
    }

    // 2. Resolve target URL by appending the request path
    // Remove leading/trailing slashes to avoid invalid URL formatting
    const cleanServiceUrl = serviceUrl.replace(/\/+$/, '');
    const path = request.url.replace(/^\/api\/v1/, '');
    const targetUrl = `${cleanServiceUrl}${path}`;

    // 3. Populate correlation, request, and client headers
    const headers: Record<string, string> = {
      'x-request-id': (request.id as string) ?? 'unknown',
      'x-correlation-id': (reply.getHeader('x-correlation-id') as string) ?? (request.id as string),
      'x-forwarded-for': request.ip,
      'user-agent': request.headers['user-agent'] ?? '',
    };

    // Forward cookies so httpOnly refresh tokens reach downstream services
    if (request.headers['cookie']) {
      headers['cookie'] = request.headers['cookie'];
    }

    if (request.headers['content-type']) {
      headers['content-type'] = request.headers['content-type'];
    }
    if (request.headers['accept']) {
      headers['accept'] = request.headers['accept'];
    }

    // 4. Inject authenticated user context to headers if available
    if (request.user) {
      headers['x-user-id'] = request.user.userId;
      headers['x-user-email'] = request.user.email;
      headers['x-user-roles'] = request.user.roles.join(',');
      if (request.user.organizationId) {
        headers['x-user-org-id'] = request.user.organizationId;
      }
      headers['x-user-session-id'] = request.user.sessionId;
    }

    // 5. Explicit body forwarding for parsed JSON payloads
    let proxyBody: any = undefined;
    if (request.body !== undefined && request.body !== null) {
      proxyBody = typeof request.body === 'object' ? JSON.stringify(request.body) : request.body;
      headers['content-type'] = headers['content-type'] || 'application/json';
    }

    let attempt = 0;
    const maxRetries = 3;

    const executeProxy = (): Promise<void> => {
      attempt++;
      return new Promise<void>((resolve, reject) => {
        void reply.from(targetUrl, {
          body: proxyBody,
          rewriteRequestHeaders: (_req, reqHeaders) => {
            const merged = {
              ...reqHeaders,
              ...headers,
            };
            // Delete content-length if we are passing a newly serialized string body
            // to allow undici to compute the exact payload byte length
            if (proxyBody !== undefined) {
              delete (merged as any)['content-length'];
            }
            return merged as any;
          },
          onError: (_reply, error) => {
            const err = error.error;
            const code = (err as any)?.code;

            const isRetryable =
              code === 'ECONNRESET' ||
              code === 'ETIMEDOUT' ||
              code === 'ECONNREFUSED' ||
              code === 'UND_ERR_HEADERS_TIMEOUT' ||
              code === 'UND_ERR_BODY_TIMEOUT';

            if (attempt < maxRetries && isRetryable) {
              request.log.warn(
                { err, attempt, targetUrl },
                `Proxy request to ${serviceName} failed (${code || err.message}). Retrying...`,
              );
              setTimeout(() => {
                resolve(executeProxy());
              }, attempt * 100);
            } else {
              recordFailure(serviceName);
              reject(err);
            }
          },
          onResponse: (_request, _reply, res: any) => {
            recordSuccess(serviceName);
            _reply.send(res.stream);
            resolve();
          },
        });
      });
    };

    try {
      await executeProxy();
      return reply;
    } catch (err: any) {
      request.log.error({ err, targetUrl, serviceName }, `Failed to proxy request to ${serviceName}: ${err.message}`);
      throw ErrorFactory.externalServiceError(serviceName, err);
    }
  };
}
