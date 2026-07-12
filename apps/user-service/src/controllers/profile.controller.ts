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
  basicInfoValidator,
  locationValidator,
  careerPreferencesValidator,
} from '../validators/profile.validator';
import { IProfile } from '../schemas/profile.schema';

// ─── Flattener ────────────────────────────────────────────────────────────────
/**
 * Converts the nested MongoDB IProfile shape into a flat object
 * that the client-side User store expects.
 */
function flattenProfile(profile: IProfile) {
  return {
    // basics
    name: profile.basics?.name ?? '',
    headline: profile.basics?.headline ?? '',
    bio: profile.basics?.bio ?? '',
    phone: profile.basics?.phone ?? '',
    dateOfBirth: profile.basics?.dateOfBirth ?? '',
    gender: profile.basics?.gender ?? '',
    avatarUrl: profile.basics?.avatarUrl ?? '',
    bannerUrl: profile.basics?.bannerUrl ?? '',
    // location
    country: profile.location?.country ?? '',
    state: profile.location?.state ?? '',
    city: profile.location?.city ?? '',
    // arrays
    education: profile.education ?? [],
    experiences: profile.experience ?? [],
    skills: profile.skills ?? [],
    languages: profile.languages ?? [],
    projects: profile.projects ?? [],
    certifications: profile.certifications ?? [],
    achievements: profile.achievements ?? [],
    portfolio: profile.portfolio ?? [],
    // career preferences
    careerGoal: profile.careerPreferences?.careerGoal ?? '',
    preferredRoles: profile.careerPreferences?.preferredRoles ?? [],
    employmentType: profile.careerPreferences?.employmentType ?? '',
    expectedSalary: profile.careerPreferences?.expectedSalary ?? '',
    preferredLocations: profile.careerPreferences?.preferredLocations ?? [],
    workMode: profile.careerPreferences?.workMode ?? 'Remote',
    availability: profile.careerPreferences?.availability ?? '',
    // social links
    github: profile.socialLinks?.github ?? '',
    linkedin: profile.socialLinks?.linkedin ?? '',
    twitter: profile.socialLinks?.twitter ?? '',
    portfolioUrl: profile.socialLinks?.portfolio ?? '',
    website: profile.socialLinks?.website ?? '',
    kaggle: profile.socialLinks?.kaggle ?? '',
    leetcode: profile.socialLinks?.leetcode ?? '',
    // preferences
    profileVisibility: profile.preferences?.profileVisibility ?? 'public',
    searchEngineIndexing: profile.preferences?.searchEngineIndexing ?? true,
    recruiterDiscovery: profile.preferences?.recruiterDiscovery ?? true,
    // metadata
    resumeUrl: profile.metadata?.resumeUrl ?? '',
    resumeFileName: profile.metadata?.resumeFileName ?? '',
    // timestamps
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

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

  // ─── Base Profile ─────────────────────────────────────
  async getProfileMe(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.getUserId(request);
    const profile = await this.profileService.getProfile(userId);
    const flat = flattenProfile(profile);
    return reply.send(createSuccessResponse({ user: flat }, request.id));
  }

  async updateProfile(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.getUserId(request);
    const { ipAddress, userAgent } = this.getContext(request);

    const body = validate(patchProfileValidator, request.body);
    const profile = await this.profileService.updateProfile(userId, body, ipAddress, userAgent);
    const flat = flattenProfile(profile);

    return reply.send(createSuccessResponse({ user: flat }, request.id));
  }

  // ─── Convenience: update basics + location in one call ────────────────────
  async updateBasics(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.getUserId(request);
    const { ipAddress, userAgent } = this.getContext(request);

    const rawBody = request.body as Record<string, any>;

    const basicsData = validate(basicInfoValidator, {
      name: rawBody.name,
      headline: rawBody.headline,
      bio: rawBody.bio,
      phone: rawBody.phone,
      dateOfBirth: rawBody.dateOfBirth,
      gender: rawBody.gender,
    });

    const locationData = validate(locationValidator, {
      country: rawBody.country,
      state: rawBody.state,
      city: rawBody.city,
    });

    const profile = await this.profileService.updateProfile(
      userId,
      { basics: basicsData, location: locationData } as any,
      ipAddress,
      userAgent,
    );
    const flat = flattenProfile(profile);

    return reply.send(createSuccessResponse({ user: flat }, request.id));
  }

  // ─── Convenience: update career preferences ────────────────────────────────
  async updateCareerPreferences(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.getUserId(request);
    const { ipAddress, userAgent } = this.getContext(request);

    const rawBody = request.body as Record<string, any>;
    const careerData = validate(careerPreferencesValidator, {
      careerGoal: rawBody.careerGoal,
      preferredRoles: rawBody.preferredRoles,
      employmentType: rawBody.employmentType,
      expectedSalary: rawBody.expectedSalary,
      preferredLocations: rawBody.preferredLocations,
      workMode: rawBody.workMode,
      availability: rawBody.availability,
    });

    const profile = await this.profileService.updateProfile(
      userId,
      { careerPreferences: careerData } as any,
      ipAddress,
      userAgent,
    );
    const flat = flattenProfile(profile);

    return reply.send(createSuccessResponse({ user: flat }, request.id));
  }

  async getCompletion(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.getUserId(request);
    const completion = await this.profileService.getCompletion(userId);
    return reply.send(createSuccessResponse(completion, request.id));
  }

  // ─── Avatar & Banner ──────────────────────────────────
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
    const flat = flattenProfile(profile);

    return reply.send(createSuccessResponse({ user: flat }, request.id));
  }

  async deleteAvatar(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.getUserId(request);
    const { ipAddress, userAgent } = this.getContext(request);

    const profile = await this.profileService.removeAvatar(userId, ipAddress, userAgent);
    const flat = flattenProfile(profile);
    return reply.send(createSuccessResponse({ user: flat }, request.id));
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
    const flat = flattenProfile(profile);

    return reply.send(createSuccessResponse({ user: flat }, request.id));
  }

  async deleteBanner(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.getUserId(request);
    const { ipAddress, userAgent } = this.getContext(request);

    const profile = await this.profileService.removeBanner(userId, ipAddress, userAgent);
    const flat = flattenProfile(profile);
    return reply.send(createSuccessResponse({ user: flat }, request.id));
  }

  // ─── Education CRUD ─────────────────────────────────
  async addEducation(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.getUserId(request);
    const { ipAddress, userAgent } = this.getContext(request);

    const body = validate(educationValidator, request.body);
    const profile = await this.profileService.addEducation(userId, body, ipAddress, userAgent);
    const flat = flattenProfile(profile);

    return reply.send(createSuccessResponse({ user: flat }, request.id));
  }

  async updateEducation(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.getUserId(request);
    const { id } = request.params as { id: string };
    const { ipAddress, userAgent } = this.getContext(request);

    const body = validate(educationValidator.partial(), request.body);
    const profile = await this.profileService.updateEducation(userId, id, body, ipAddress, userAgent);
    const flat = flattenProfile(profile);

    return reply.send(createSuccessResponse({ user: flat }, request.id));
  }

  async deleteEducation(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.getUserId(request);
    const { id } = request.params as { id: string };
    const { ipAddress, userAgent } = this.getContext(request);

    const profile = await this.profileService.deleteEducation(userId, id, ipAddress, userAgent);
    const flat = flattenProfile(profile);
    return reply.send(createSuccessResponse({ user: flat }, request.id));
  }

  // ─── Experience CRUD ────────────────────────────────
  async addExperience(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.getUserId(request);
    const { ipAddress, userAgent } = this.getContext(request);

    const body = validate(experienceValidator, request.body);
    const profile = await this.profileService.addExperience(userId, body, ipAddress, userAgent);
    const flat = flattenProfile(profile);

    return reply.send(createSuccessResponse({ user: flat }, request.id));
  }

  async updateExperience(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.getUserId(request);
    const { id } = request.params as { id: string };
    const { ipAddress, userAgent } = this.getContext(request);

    const body = validate(experienceValidator.partial(), request.body);
    const profile = await this.profileService.updateExperience(userId, id, body, ipAddress, userAgent);
    const flat = flattenProfile(profile);

    return reply.send(createSuccessResponse({ user: flat }, request.id));
  }

  async deleteExperience(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.getUserId(request);
    const { id } = request.params as { id: string };
    const { ipAddress, userAgent } = this.getContext(request);

    const profile = await this.profileService.deleteExperience(userId, id, ipAddress, userAgent);
    const flat = flattenProfile(profile);
    return reply.send(createSuccessResponse({ user: flat }, request.id));
  }

  // ─── Project CRUD ───────────────────────────────────
  async addProject(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.getUserId(request);
    const { ipAddress, userAgent } = this.getContext(request);

    const body = validate(projectValidator, request.body);
    const profile = await this.profileService.addProject(userId, body, ipAddress, userAgent);
    const flat = flattenProfile(profile);

    return reply.send(createSuccessResponse({ user: flat }, request.id));
  }

  async updateProject(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.getUserId(request);
    const { id } = request.params as { id: string };
    const { ipAddress, userAgent } = this.getContext(request);

    const body = validate(projectValidator.partial(), request.body);
    const profile = await this.profileService.updateProject(userId, id, body, ipAddress, userAgent);
    const flat = flattenProfile(profile);

    return reply.send(createSuccessResponse({ user: flat }, request.id));
  }

  async deleteProject(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.getUserId(request);
    const { id } = request.params as { id: string };
    const { ipAddress, userAgent } = this.getContext(request);

    const profile = await this.profileService.deleteProject(userId, id, ipAddress, userAgent);
    const flat = flattenProfile(profile);
    return reply.send(createSuccessResponse({ user: flat }, request.id));
  }

  // ─── Certification CRUD ─────────────────────────────
  async addCertification(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.getUserId(request);
    const { ipAddress, userAgent } = this.getContext(request);

    const body = validate(certificationValidator, request.body);
    const profile = await this.profileService.addCertification(userId, body, ipAddress, userAgent);
    const flat = flattenProfile(profile);

    return reply.send(createSuccessResponse({ user: flat }, request.id));
  }

  async updateCertification(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.getUserId(request);
    const { id } = request.params as { id: string };
    const { ipAddress, userAgent } = this.getContext(request);

    const body = validate(certificationValidator.partial(), request.body);
    const profile = await this.profileService.updateCertification(userId, id, body, ipAddress, userAgent);
    const flat = flattenProfile(profile);

    return reply.send(createSuccessResponse({ user: flat }, request.id));
  }

  async deleteCertification(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.getUserId(request);
    const { id } = request.params as { id: string };
    const { ipAddress, userAgent } = this.getContext(request);

    const profile = await this.profileService.deleteCertification(userId, id, ipAddress, userAgent);
    const flat = flattenProfile(profile);
    return reply.send(createSuccessResponse({ user: flat }, request.id));
  }

  // ─── Social Links ──────────────────────────────────
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
    const flat = flattenProfile(profile);

    return reply.send(createSuccessResponse({ user: flat }, request.id));
  }

  // ─── Activity Timeline ──────────────────────────────
  async getActivityTimeline(request: FastifyRequest, reply: FastifyReply) {
    const userId = this.getUserId(request);
    const timeline = await this.profileService.getActivityTimeline(userId);
    return reply.send(createSuccessResponse(timeline, request.id));
  }
}
