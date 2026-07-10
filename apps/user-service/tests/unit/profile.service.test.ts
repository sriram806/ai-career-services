import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProfileService } from '../../src/services/profile.service';
import { ProfileRepository } from '../../src/repositories/profile.repository';
import { MetadataRepository } from '../../src/repositories/metadata.repository';
import { ProfileCompletionEngine } from '../../src/services/completion-engine.service';
import Redis from 'ioredis';
import { EventBus } from '@ai-career-os/events';
import { IProfile } from '../../src/schemas/profile.schema';

describe('ProfileService', () => {
  let profileService: ProfileService;
  let profileRepo: any;
  let metadataRepo: any;
  let completionEngine: any;
  let redis: any;
  let eventBus: any;

  beforeEach(() => {
    profileRepo = {
      findByUserId: vi.fn(),
      create: vi.fn(),
      updateByUserId: vi.fn(),
    };

    metadataRepo = {
      createAuditLog: vi.fn(),
      createProfileEvent: vi.fn(),
      createUpload: vi.fn(),
    };

    completionEngine = new ProfileCompletionEngine();

    redis = {
      get: vi.fn(),
      setex: vi.fn(),
      del: vi.fn(),
    };

    eventBus = {
      publish: vi.fn(),
    };

    profileService = new ProfileService(
      profileRepo as any,
      metadataRepo as any,
      completionEngine,
      redis as any,
      eventBus as any,
    );
  });

  describe('getProfile', () => {
    it('should return cached profile if present', async () => {
      const mockCached = JSON.stringify({ userId: 'user-123', basics: { name: 'Sriram' } });
      redis.get.mockResolvedValue(mockCached);

      const result = await profileService.getProfile('user-123');
      expect(result.userId).toBe('user-123');
      expect(redis.get).toHaveBeenCalledWith('profile:user-123');
      expect(profileRepo.findByUserId).not.toHaveBeenCalled();
    });

    it('should query repo and cache if not in redis', async () => {
      redis.get.mockResolvedValue(null);
      profileRepo.findByUserId.mockResolvedValue({
        userId: 'user-123',
        basics: { name: 'Sriram' },
      } as IProfile);

      const result = await profileService.getProfile('user-123');
      expect(result.basics.name).toBe('Sriram');
      expect(redis.setex).toHaveBeenCalled();
    });
  });

  describe('addEducation', () => {
    it('should throw an error on duplicate education entry', async () => {
      const mockProfile = {
        userId: 'user-123',
        education: [
          { university: 'IIT', degree: 'BTech', graduationYear: '2025' }
        ],
        save: vi.fn(),
      } as any;

      profileRepo.findByUserId.mockResolvedValue(mockProfile);
      redis.get.mockResolvedValue(null);

      await expect(
        profileService.addEducation('user-123', {
          university: 'IIT',
          degree: 'BTech',
          graduationYear: '2025',
        })
      ).rejects.toThrow('Education milestone already exists');
    });

    it('should add education and publish event if it is not duplicate', async () => {
      const mockProfile = {
        userId: 'user-123',
        education: [],
        save: vi.fn().mockResolvedValue({
          userId: 'user-123',
          education: [{ id: 'edu-1', university: 'IIT' }],
        }),
      } as any;

      profileRepo.findByUserId.mockResolvedValue(mockProfile);
      redis.get.mockResolvedValue(null);

      const result = await profileService.addEducation('user-123', {
        university: 'IIT',
        degree: 'BTech',
        graduationYear: '2025',
      });

      expect(result.education.length).toBe(1);
      expect(eventBus.publish).toHaveBeenCalled();
      expect(metadataRepo.createAuditLog).toHaveBeenCalled();
    });
  });

  describe('addCertification', () => {
    it('should throw conflict if certification with same name and issuer exists', async () => {
      const mockProfile = {
        userId: 'user-123',
        certifications: [
          { name: 'AWS Cloud Practitioner', issuer: 'Amazon' }
        ],
        save: vi.fn(),
      } as any;

      profileRepo.findByUserId.mockResolvedValue(mockProfile);
      redis.get.mockResolvedValue(null);

      await expect(
        profileService.addCertification('user-123', {
          name: 'AWS Cloud Practitioner',
          issuer: 'Amazon',
        })
      ).rejects.toThrow('Certification already exists');
    });
  });
});
