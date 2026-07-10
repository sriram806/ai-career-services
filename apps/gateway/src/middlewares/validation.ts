import { ErrorFactory } from '@ai-career-os/errors';
import type { FastifyRequest, FastifyReply } from 'fastify';

// ─── Injection Pattern Regular Expressions ──────────
const SQL_INJECTION_REGEX = /\b(UNION\s+(?:ALL\s+)?SELECT|SELECT\s+.*\s+FROM|INSERT\s+INTO|UPDATE\s+.*\s+SET|DELETE\s+FROM|DROP\s+TABLE)\b|(--)|(\/\*)|(\*\/)|OR\s+['"]?\d+['"]?\s*=\s*['"]?\d+/i;
const NOSQL_INJECTION_REGEX = /\$(?:eq|ne|gt|gte|lt|lte|in|nin|and|or|not|expr|exists|regex)/i;

/**
 * Recursively scans a value (string, object, array) for SQL/NoSQL injection signatures.
 */
export function hasInjectionSignature(value: unknown): boolean {
  if (typeof value === 'string') {
    return SQL_INJECTION_REGEX.test(value) || NOSQL_INJECTION_REGEX.test(value);
  }

  if (value && typeof value === 'object') {
    if (Array.isArray(value)) {
      return value.some((item) => hasInjectionSignature(item));
    }

    const obj = value as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      // Check keys for NoSQL operators like $ne, $gt, etc.
      if (NOSQL_INJECTION_REGEX.test(key)) {
        return true;
      }
      // Check property values
      if (hasInjectionSignature(obj[key])) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Fastify preHandler hook to validate request headers, content type,
 * and check for SQL/NoSQL injection patterns.
 */
export async function validateRequestSecurity(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const method = request.method.toUpperCase();

  // 1. Content-Type and Accept Header Validation
  const contentType = request.headers['content-type'];
  const accept = request.headers['accept'];

  // Accept validation
  if (accept && typeof accept === 'string') {
    if (accept.includes(';') && !accept.includes('q=')) {
      // Basic check for potentially malformed/exploit accept headers
      if (hasInjectionSignature(accept)) {
        throw ErrorFactory.badRequest('Malformed or unsecure Accept header');
      }
    }
  }

  // Content-Type validation for write methods
  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    if (!contentType) {
      throw ErrorFactory.badRequest('Missing Content-Type header for write request');
    }

    const isJson = contentType.startsWith('application/json');
    const isMultipart = contentType.startsWith('multipart/form-data');
    const isUrlEncoded = contentType.startsWith('application/x-www-form-urlencoded');

    if (!isJson && !isMultipart && !isUrlEncoded) {
      throw ErrorFactory.badRequest(
        `Unsupported Content-Type: ${contentType}. Allowed types: application/json, multipart/form-data, application/x-www-form-urlencoded`,
      );
    }
  }

  // 2. SQL & NoSQL Injection Protection
  // Scan Path parameters
  if (request.params && hasInjectionSignature(request.params)) {
    throw ErrorFactory.badRequest('Security Validation Failed: Malicious query parameters or path');
  }

  // Scan Query string parameters
  if (request.query && hasInjectionSignature(request.query)) {
    throw ErrorFactory.badRequest('Security Validation Failed: Malicious query parameters or path');
  }

  // Scan Request body
  if (request.body && hasInjectionSignature(request.body)) {
    throw ErrorFactory.badRequest('Security Validation Failed: Malicious content detected in body');
  }
}
