import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthController } from '../../src/controllers/auth.controller';

describe('AuthController — Resend Verification', () => {
  let controller: AuthController;
  let mockAuthService: any;
  let mockEmailVerificationService: any;
  let mockUserRepository: any;
  let mockReq: any;
  let mockReply: any;

  beforeEach(() => {
    mockAuthService = {
      getMe: vi.fn(),
    };
    mockEmailVerificationService = {
      resendVerification: vi.fn().mockResolvedValue('123456'),
    };
    mockUserRepository = {
      findByEmail: vi.fn(),
    };
    mockReq = {
      id: 'req-1',
      body: { email: 'test@example.com' },
      ip: '127.0.0.1',
      headers: { 'user-agent': 'vitest' },
    };
    mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockImplementation((val) => val),
    };

    controller = new AuthController(
      mockAuthService,
      mockEmailVerificationService,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      mockUserRepository,
    );
  });

  it('should find user by email using userRepository and send verification code', async () => {
    mockUserRepository.findByEmail.mockResolvedValue({
      id: 'user-uuid-123',
      email: 'test@example.com',
      emailVerified: false,
    });

    const response = await controller.resendVerification(mockReq, mockReply);

    expect(mockUserRepository.findByEmail).toHaveBeenCalledWith('test@example.com');
    expect(mockAuthService.getMe).not.toHaveBeenCalled();
    expect(mockEmailVerificationService.resendVerification).toHaveBeenCalledWith('user-uuid-123', {
      ipAddress: '127.0.0.1',
      userAgent: 'vitest',
    });
    expect(mockReply.status).toHaveBeenCalledWith(200);
  });

  it('should throw badRequest error if email is already verified', async () => {
    mockUserRepository.findByEmail.mockResolvedValue({
      id: 'user-uuid-123',
      email: 'test@example.com',
      emailVerified: true,
    });

    await expect(controller.resendVerification(mockReq, mockReply)).rejects.toThrow(
      'Email is already verified',
    );
  });

  it('should return generic success message without sending code if user does not exist', async () => {
    mockUserRepository.findByEmail.mockResolvedValue(null);

    await controller.resendVerification(mockReq, mockReply);

    expect(mockUserRepository.findByEmail).toHaveBeenCalledWith('test@example.com');
    expect(mockEmailVerificationService.resendVerification).not.toHaveBeenCalled();
    expect(mockReply.status).toHaveBeenCalledWith(200);
  });
});
