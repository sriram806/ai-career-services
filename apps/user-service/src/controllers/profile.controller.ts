import { FastifyRequest, FastifyReply } from 'fastify';
import { createSuccessResponse } from '@ai-career-os/common';
import { ErrorFactory } from '@ai-career-os/errors';
import { validate } from '@ai-career-os/validation';
import { ProfileService } from '../services/profile.service';
import {
  patchProfileValidator,
  educationValidator,
  experienceValidator,
  projectValidator,
  certificationValidator,
  socialLinksValidator,
} from '../validators/profile.validator';

export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  private getUserId(request: FastifyRequest): string {
    const user = (request as any).user;
    if (!user?.userId) {
      throw ErrorFactory.unauthorized('Authentication required');
    }
    return user.userId;
  }

  private getContext(request: FastifyRequest) {
    return {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] || '',
    };
  }

  async getProfileMe(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.getUserId(request);
    const profile = await this.profileService.getProfile(userId);
    return reply.send(createSuccessResponse(profile, request.id));
  }

  async updateProfile(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.getUserId(request);
    const { ipAddress, userAgent } = this.getContext(request);

    const body = validate(patchProfileValidator, request.body);
    const profile = await this.profileService.updateProfile(userId, body, ipAddress, userAgent);

    return reply.send(createSuccessResponse(profile, request.id));
  }

  async getCompletion(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.getUserId(request);
    const completion = await this.profileService.getCompletion(userId);
    return reply.send(createSuccessResponse(completion, request.id));
  }

  async uploadAvatar(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.getUserId(request);
    const { ipAddress, userAgent } = this.getContext(request);

    const body = request.body as {
      fileName: string;
      fileSize: number;
      mimeType?: string;
      filePath?: string;
    };

    if (!body?.fileName || !body?.fileSize) {
      throw ErrorFactory.validationError([{ field: 'fileName/fileSize', message: 'Missing file metadata', code: 'invalid_type' }]);
    }

    const profile = await this.profileService.updateAvatar(
      userId,
      {
        fileName: body.fileName,
        fileSize: body.fileSize,
        mimeType: body.mimeType || 'image/png',
        filePath: body.filePath || `/uploads/avatars/${userId}-${body.fileName}`,
      },
      ipAddress,
      userAgent,
    );

    return reply.send(createSuccessResponse(profile, request.id));
  }

  async deleteAvatar(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.getUserId(request);
    const { ipAddress, userAgent } = this.getContext(request);

    const profile = await this.profileService.removeAvatar(userId, ipAddress, userAgent);
    return reply.send(createSuccessResponse(profile, request.id));
  }

  async uploadBanner(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.getUserId(request);
    const { ipAddress, userAgent } = this.getContext(request);

    const body = request.body as {
      fileName: string;
      fileSize: number;
      mimeType?: string;
      filePath?: string;
    };

    if (!body?.fileName || !body?.fileSize) {
      throw ErrorFactory.validationError([{ field: 'fileName/fileSize', message: 'Missing file metadata', code: 'invalid_type' }]);
    }

    const profile = await this.profileService.updateBanner(
      userId,
      {
        fileName: body.fileName,
        fileSize: body.fileSize,
        mimeType: body.mimeType || 'image/png',
        filePath: body.filePath || `/uploads/banners/${userId}-${body.fileName}`,
      },
      ipAddress,
      userAgent,
    );

    return reply.send(createSuccessResponse(profile, request.id));
  }

  async deleteBanner(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.getUserId(request);
    const { ipAddress, userAgent } = this.getContext(request);

    const profile = await this.profileService.removeBanner(userId, ipAddress, userAgent);
    return reply.send(createSuccessResponse(profile, request.id));
  }

  // ─── Education CRUD ─────────────────────────────────
  async addEducation(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.getUserId(request);
    const { ipAddress, userAgent } = this.getContext(request);

    const body = validate(educationValidator, request.body);
    const profile = await this.profileService.addEducation(userId, body, ipAddress, userAgent);

    return reply.send(createSuccessResponse(profile, request.id));
  }

  async updateEducation(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.getUserId(request);
    const { id } = request.params as { id: string };
    const { ipAddress, userAgent } = this.getContext(request);

    const body = validate(educationValidator.partial(), request.body);
    const profile = await this.profileService.updateEducation(userId, id, body, ipAddress, userAgent);

    return reply.send(createSuccessResponse(profile, request.id));
  }

  async deleteEducation(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.getUserId(request);
    const { id } = request.params as { id: string };
    const { ipAddress, userAgent } = this.getContext(request);

    const profile = await this.profileService.deleteEducation(userId, id, ipAddress, userAgent);
    return reply.send(createSuccessResponse(profile, request.id));
  }

  // ─── Experience CRUD ────────────────────────────────
  async addExperience(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.getUserId(request);
    const { ipAddress, userAgent } = this.getContext(request);

    const body = validate(experienceValidator, request.body);
    const profile = await this.profileService.addExperience(userId, body, ipAddress, userAgent);

    return reply.send(createSuccessResponse(profile, request.id));
  }

  async updateExperience(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.getUserId(request);
    const { id } = request.params as { id: string };
    const { ipAddress, userAgent } = this.getContext(request);

    const body = validate(experienceValidator.partial(), request.body);
    const profile = await this.profileService.updateExperience(userId, id, body, ipAddress, userAgent);

    return reply.send(createSuccessResponse(profile, request.id));
  }

  async deleteExperience(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.getUserId(request);
    const { id } = request.params as { id: string };
    const { ipAddress, userAgent } = this.getContext(request);

    const profile = await this.profileService.deleteExperience(userId, id, ipAddress, userAgent);
    return reply.send(createSuccessResponse(profile, request.id));
  }

  // ─── Project CRUD ───────────────────────────────────
  async addProject(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.getUserId(request);
    const { ipAddress, userAgent } = this.getContext(request);

    const body = validate(projectValidator, request.body);
    const profile = await this.profileService.addProject(userId, body, ipAddress, userAgent);

    return reply.send(createSuccessResponse(profile, request.id));
  }

  async updateProject(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.getUserId(request);
    const { id } = request.params as { id: string };
    const { ipAddress, userAgent } = this.getContext(request);

    const body = validate(projectValidator.partial(), request.body);
    const profile = await this.profileService.updateProject(userId, id, body, ipAddress, userAgent);

    return reply.send(createSuccessResponse(profile, request.id));
  }

  async deleteProject(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.getUserId(request);
    const { id } = request.params as { id: string };
    const { ipAddress, userAgent } = this.getContext(request);

    const profile = await this.profileService.deleteProject(userId, id, ipAddress, userAgent);
    return reply.send(createSuccessResponse(profile, request.id));
  }

  // ─── Certification CRUD ─────────────────────────────
  async addCertification(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.getUserId(request);
    const { ipAddress, userAgent } = this.getContext(request);

    const body = validate(certificationValidator, request.body);
    const profile = await this.profileService.addCertification(userId, body, ipAddress, userAgent);

    return reply.send(createSuccessResponse(profile, request.id));
  }

  async updateCertification(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.getUserId(request);
    const { id } = request.params as { id: string };
    const { ipAddress, userAgent } = this.getContext(request);

    const body = validate(certificationValidator.partial(), request.body);
    const profile = await this.profileService.updateCertification(userId, id, body, ipAddress, userAgent);

    return reply.send(createSuccessResponse(profile, request.id));
  }

  async deleteCertification(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.getUserId(request);
    const { id } = request.params as { id: string };
    const { ipAddress, userAgent } = this.getContext(request);

    const profile = await this.profileService.deleteCertification(userId, id, ipAddress, userAgent);
    return reply.send(createSuccessResponse(profile, request.id));
  }

  // ─── Social Links CRUD ──────────────────────────────
  async updateSocialLinks(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.getUserId(request);
    const { ipAddress, userAgent } = this.getContext(request);

    const body = validate(socialLinksValidator, request.body);
    const profile = await this.profileService.updateProfile(
      userId,
      { socialLinks: body } as any,
      ipAddress,
      userAgent,
    );

    return reply.send(createSuccessResponse(profile, request.id));
  }

  // ─── Activity Timeline ──────────────────────────────
  async getActivityTimeline(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.getUserId(request);
    const timeline = await this.profileService.getActivityTimeline(userId);
    return reply.send(createSuccessResponse(timeline, request.id));
  }
}
