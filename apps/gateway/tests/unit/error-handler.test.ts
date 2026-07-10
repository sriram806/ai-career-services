import { describe, it, expect, vi } from 'vitest';
import { gatewayErrorHandler } from '../../src/middlewares/error-handler';
import { AppError } from '@ai-career-os/errors';
import { ErrorCode } from '@ai-career-os/types';

describe('Error Handler Middleware', () => {
  it('should format AppError correctly', () => {
    const mockRequest = {
      id: 'test-req-id',
    } as any;

    const mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
    } as any;

    const appError = new AppError(ErrorCode.RESOURCE_NOT_FOUND, 'User not found', {
      details: [{ field: 'userId', message: 'User ID is invalid', code: 'invalid' }],
    });

    gatewayErrorHandler(appError, mockRequest, mockReply);

    expect(mockReply.status).toHaveBeenCalledWith(404);
    expect(mockReply.send).toHaveBeenCalledWith({
      error: {
        code: ErrorCode.RESOURCE_NOT_FOUND,
        message: 'User not found',
        requestId: 'test-req-id',
        details: {
          userId: 'User ID is invalid',
        },
      },
    });
  });

  it('should format validation errors correctly', () => {
    const mockRequest = {
      id: 'test-req-id',
    } as any;

    const mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
    } as any;

    const validationError = {
      validation: [
        {
          params: { missingProperty: 'email' },
          message: 'should have required property email',
        },
      ],
    } as any;

    gatewayErrorHandler(validationError, mockRequest, mockReply);

    expect(mockReply.status).toHaveBeenCalledWith(422);
    expect(mockReply.send).toHaveBeenCalledWith({
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Request validation failed',
        requestId: 'test-req-id',
        details: {
          email: 'should have required property email',
        },
      },
    });
  });

  it('should mask connection errors with generic External Service Error', () => {
    const mockRequest = {
      id: 'test-req-id',
      log: {
        error: vi.fn(),
      },
    } as any;

    const mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
    } as any;

    const connectionError = new Error('connect ECONNREFUSED 127.0.0.1:3001');
    (connectionError as any).code = 'ECONNREFUSED';

    // Simulate production environment
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      gatewayErrorHandler(connectionError, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(502);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: {
          code: ErrorCode.EXTERNAL_SERVICE_ERROR,
          message: 'Failed to communicate with upstream service',
          requestId: 'test-req-id',
          details: {},
        },
      });
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
    }
  });
});
