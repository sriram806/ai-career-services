import Redis from 'ioredis';
import crypto from 'node:crypto';
import { EventBus, createEvent } from '@ai-career-os/events';
import { ErrorFactory } from '@ai-career-os/errors';
import { ProfileRepository } from '../repositories/profile.repository';
import { MetadataRepository } from '../repositories/metadata.repository';
import { ProfileCompletionEngine, CompletionResult } from './completion-engine.service';
import { IProfile, IEducation, IExperience, IProject, ICertification } from '../schemas/profile.schema';

export class ProfileService {
  private readonly CACHE_TTL = 3600; // 1 hour in seconds
  private readonly sourceName = 'user-service';

  constructor(
    private readonly profileRepo: ProfileRepository,
    private readonly metadataRepo: MetadataRepository,
    private readonly completionEngine: ProfileCompletionEngine,
    private readonly redis: Redis,
    private readonly eventBus: EventBus,
  ) {}

  private getProfileCacheKey(userId: string): string {
    return `profile:${userId}`;
  }

  private getCompletionCacheKey(userId: string): string {
    return `profile:completion:${userId}`;
  }

  private async invalidateCache(userId: string): Promise<void> {
    await this.redis.del(this.getProfileCacheKey(userId));
    await this.redis.del(this.getCompletionCacheKey(userId));
  }

  /**
   * Retrieves profile by userId, creating one if not exists.
   */
  async getProfile(userId: string): Promise<IProfile> {
    const cacheKey = this.getProfileCacheKey(userId);
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached) as IProfile;
    }

    let profile = await this.profileRepo.findByUserId(userId);
    if (!profile) {
      profile = await this.profileRepo.create(userId, {});
      const event = createEvent('profile.created', this.sourceName, { userId });
      await this.eventBus.publish('profile.created', event);

      // Audit profile creation
      await this.metadataRepo.createAuditLog({
        userId,
        action: 'PROFILE_CREATED',
        entityName: 'Profile',
        entityId: profile._id.toString(),
        details: { message: 'Initial empty profile created' },
      });
    }

    await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(profile));
    return profile;
  }

  /**
   * Calculates or retrieves profile completion.
   */
  async getCompletion(userId: string): Promise<CompletionResult> {
    const cacheKey = this.getCompletionCacheKey(userId);
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached) as CompletionResult;
    }

    const profile = await this.getProfile(userId);
    const result = this.completionEngine.calculateCompletion(profile);

    await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(result));
    return result;
  }

  /**
   * Updates basic information, location, career preferences, social links, preferences.
   */
  async updateProfile(
    userId: string,
    data: Partial<IProfile>,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<IProfile> {
    await this.getProfile(userId); // Ensure profile exists

    const updated = await this.profileRepo.updateByUserId(userId, data);
    if (!updated) {
      throw ErrorFactory.notFound('Profile not found');
    }

    await this.invalidateCache(userId);

    // Publish event
    const event = createEvent('profile.updated', this.sourceName, { userId, updates: Object.keys(data) });
    await this.eventBus.publish('profile.updated', event);

    // Check completion threshold
    const completion = await this.getCompletion(userId);
    if (completion.overallPercentage === 100) {
      const completedEvent = createEvent('profile.completed', this.sourceName, { userId });
      await this.eventBus.publish('profile.completed', completedEvent);
    }

    // Determine audit action type
    let action = 'PROFILE_UPDATED';
    if (data.socialLinks) {
      action = 'SOCIAL_LINKS_UPDATED';
    } else if (data.careerPreferences) {
      action = 'CAREER_PREFERENCES_UPDATED';
    }

    // Audit logs
    await this.metadataRepo.createAuditLog({
      userId,
      action,
      entityName: 'Profile',
      entityId: updated._id.toString(),
      ipAddress,
      userAgent,
      details: { fields: Object.keys(data) },
    });

    // Profile update event inside profileEvents
    await this.metadataRepo.createProfileEvent({
      userId,
      eventType: 'profile.updated',
      ipAddress,
      userAgent,
      details: { fields: Object.keys(data) },
    });

    return updated;
  }

  /**
   * Update Avatar url and store upload metadata.
   */
  async updateAvatar(
    userId: string,
    avatarFile: { fileName: string; fileSize: number; mimeType?: string; filePath?: string },
    ipAddress?: string,
    userAgent?: string,
  ): Promise<IProfile> {
    await this.metadataRepo.createUpload({
      userId,
      uploadType: 'avatar',
      fileName: avatarFile.fileName,
      fileSize: avatarFile.fileSize,
      mimeType: avatarFile.mimeType,
      filePath: avatarFile.filePath,
    });

    const updatedProfile = await this.updateProfile(
      userId,
      { 'basics.avatarUrl': avatarFile.filePath } as any,
      ipAddress,
      userAgent,
    );

    const event = createEvent('profile.avatar.updated', this.sourceName, { userId, avatarUrl: avatarFile.filePath });
    await this.eventBus.publish('profile.avatar.updated', event);

    await this.metadataRepo.createProfileEvent({
      userId,
      eventType: 'profile.avatar.updated',
      ipAddress,
      userAgent,
      details: { avatarUrl: avatarFile.filePath },
    });

    return updatedProfile;
  }

  /**
   * Remove Avatar.
   */
  async removeAvatar(userId: string, ipAddress?: string, userAgent?: string): Promise<IProfile> {
    const updatedProfile = await this.updateProfile(
      userId,
      { 'basics.avatarUrl': '' } as any,
      ipAddress,
      userAgent,
    );

    const event = createEvent('profile.avatar.updated', this.sourceName, { userId, avatarUrl: '' });
    await this.eventBus.publish('profile.avatar.updated', event);

    await this.metadataRepo.createProfileEvent({
      userId,
      eventType: 'profile.avatar.removed',
      ipAddress,
      userAgent,
    });

    return updatedProfile;
  }

  /**
   * Update Banner cover url and store upload metadata.
   */
  async updateBanner(
    userId: string,
    bannerFile: { fileName: string; fileSize: number; mimeType?: string; filePath?: string },
    ipAddress?: string,
    userAgent?: string,
  ): Promise<IProfile> {
    await this.metadataRepo.createUpload({
      userId,
      uploadType: 'banner',
      fileName: bannerFile.fileName,
      fileSize: bannerFile.fileSize,
      mimeType: bannerFile.mimeType,
      filePath: bannerFile.filePath,
    });

    const updatedProfile = await this.updateProfile(
      userId,
      { 'basics.bannerUrl': bannerFile.filePath } as any,
      ipAddress,
      userAgent,
    );

    await this.metadataRepo.createProfileEvent({
      userId,
      eventType: 'profile.banner.updated',
      ipAddress,
      userAgent,
      details: { bannerUrl: bannerFile.filePath },
    });

    return updatedProfile;
  }

  /**
   * Remove Banner.
   */
  async removeBanner(userId: string, ipAddress?: string, userAgent?: string): Promise<IProfile> {
    const updatedProfile = await this.updateProfile(
      userId,
      { 'basics.bannerUrl': '' } as any,
      ipAddress,
      userAgent,
    );

    await this.metadataRepo.createProfileEvent({
      userId,
      eventType: 'profile.banner.removed',
      ipAddress,
      userAgent,
    });

    return updatedProfile;
  }

  // ─── Education CRUD ─────────────────────────────────
  async addEducation(
    userId: string,
    edu: Omit<IEducation, 'id'>,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<IProfile> {
    const profile = await this.getProfile(userId);

    const duplicate = profile.education.find(
      (e) =>
        e.university.toLowerCase() === edu.university.toLowerCase() &&
        e.degree?.toLowerCase() === edu.degree?.toLowerCase() &&
        e.graduationYear === edu.graduationYear,
    );
    if (duplicate) {
      throw ErrorFactory.conflict('Education milestone already exists');
    }

    const newEdu: IEducation = {
      id: crypto.randomUUID(),
      ...edu,
    };

    profile.education.push(newEdu);
    const updated = await profile.save();
    await this.invalidateCache(userId);

    const event = createEvent('profile.education.updated', this.sourceName, { userId, action: 'ADD', educationId: newEdu.id });
    await this.eventBus.publish('profile.education.updated', event);

    await this.metadataRepo.createAuditLog({
      userId,
      action: 'EDUCATION_ADDED',
      entityName: 'ProfileEducation',
      entityId: newEdu.id,
      ipAddress,
      userAgent,
      details: { university: edu.university },
    });

    await this.metadataRepo.createProfileEvent({
      userId,
      eventType: 'profile.education.added',
      ipAddress,
      userAgent,
      details: { university: edu.university, degree: edu.degree },
    });

    return updated;
  }

  async updateEducation(
    userId: string,
    eduId: string,
    eduUpdates: Partial<IEducation>,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<IProfile> {
    const profile = await this.getProfile(userId);
    const index = profile.education.findIndex((e) => e.id === eduId);
    if (index === -1) {
      throw ErrorFactory.notFound('Education milestone not found');
    }

    const merged = { ...profile.education[index], ...eduUpdates };

    const duplicate = profile.education.find(
      (e) =>
        e.id !== eduId &&
        e.university.toLowerCase() === (merged.university ?? '').toLowerCase() &&
        e.degree?.toLowerCase() === (merged.degree ?? '').toLowerCase() &&
        e.graduationYear === merged.graduationYear,
    );
    if (duplicate) {
      throw ErrorFactory.conflict('Another matching education entry already exists');
    }

    profile.education[index] = merged as IEducation;
    const updated = await profile.save();
    await this.invalidateCache(userId);

    const event = createEvent('profile.education.updated', this.sourceName, { userId, action: 'UPDATE', educationId: eduId });
    await this.eventBus.publish('profile.education.updated', event);

    await this.metadataRepo.createAuditLog({
      userId,
      action: 'EDUCATION_UPDATED',
      entityName: 'ProfileEducation',
      entityId: eduId,
      ipAddress,
      userAgent,
      details: { university: merged.university },
    });

    return updated;
  }

  async deleteEducation(
    userId: string,
    eduId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<IProfile> {
    const profile = await this.getProfile(userId);
    const index = profile.education.findIndex((e) => e.id === eduId);
    if (index === -1) {
      throw ErrorFactory.notFound('Education milestone not found');
    }

    const deleted = profile.education[index];
    if (!deleted) {
      throw ErrorFactory.notFound('Education milestone not found');
    }
    profile.education.splice(index, 1);
    const updated = await profile.save();
    await this.invalidateCache(userId);

    const event = createEvent('profile.education.updated', this.sourceName, { userId, action: 'DELETE', educationId: eduId });
    await this.eventBus.publish('profile.education.updated', event);

    await this.metadataRepo.createAuditLog({
      userId,
      action: 'EDUCATION_DELETED',
      entityName: 'ProfileEducation',
      entityId: eduId,
      ipAddress,
      userAgent,
      details: { university: deleted.university },
    });

    return updated;
  }

  // ─── Experience CRUD ────────────────────────────────
  async addExperience(
    userId: string,
    exp: Omit<IExperience, 'id'>,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<IProfile> {
    const profile = await this.getProfile(userId);

    const newExp: IExperience = {
      id: crypto.randomUUID(),
      ...exp,
    };

    profile.experience.push(newExp);
    const updated = await profile.save();
    await this.invalidateCache(userId);

    const event = createEvent('profile.updated', this.sourceName, { userId });
    await this.eventBus.publish('profile.updated', event);

    await this.metadataRepo.createAuditLog({
      userId,
      action: 'EXPERIENCE_ADDED',
      entityName: 'ProfileExperience',
      entityId: newExp.id,
      ipAddress,
      userAgent,
      details: { company: exp.company, role: exp.role },
    });

    await this.metadataRepo.createProfileEvent({
      userId,
      eventType: 'profile.experience.added',
      ipAddress,
      userAgent,
      details: { company: exp.company, role: exp.role },
    });

    return updated;
  }

  async updateExperience(
    userId: string,
    expId: string,
    expUpdates: Partial<IExperience>,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<IProfile> {
    const profile = await this.getProfile(userId);
    const index = profile.experience.findIndex((e) => e.id === expId);
    if (index === -1) {
      throw ErrorFactory.notFound('Experience entry not found');
    }

    const merged = { ...profile.experience[index], ...expUpdates };
    profile.experience[index] = merged as IExperience;
    const updated = await profile.save();
    await this.invalidateCache(userId);

    const event = createEvent('profile.updated', this.sourceName, { userId });
    await this.eventBus.publish('profile.updated', event);

    await this.metadataRepo.createAuditLog({
      userId,
      action: 'EXPERIENCE_UPDATED',
      entityName: 'ProfileExperience',
      entityId: expId,
      ipAddress,
      userAgent,
      details: { company: merged.company, role: merged.role },
    });

    return updated;
  }

  async deleteExperience(
    userId: string,
    expId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<IProfile> {
    const profile = await this.getProfile(userId);
    const index = profile.experience.findIndex((e) => e.id === expId);
    if (index === -1) {
      throw ErrorFactory.notFound('Experience entry not found');
    }

    const deleted = profile.experience[index];
    if (!deleted) {
      throw ErrorFactory.notFound('Experience entry not found');
    }
    profile.experience.splice(index, 1);
    const updated = await profile.save();
    await this.invalidateCache(userId);

    const event = createEvent('profile.updated', this.sourceName, { userId });
    await this.eventBus.publish('profile.updated', event);

    await this.metadataRepo.createAuditLog({
      userId,
      action: 'EXPERIENCE_DELETED',
      entityName: 'ProfileExperience',
      entityId: expId,
      ipAddress,
      userAgent,
      details: { company: deleted.company, role: deleted.role },
    });

    return updated;
  }

  // ─── Projects CRUD ──────────────────────────────────
  async addProject(
    userId: string,
    proj: Omit<IProject, 'id'>,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<IProfile> {
    const profile = await this.getProfile(userId);

    const newProj: IProject = {
      id: crypto.randomUUID(),
      ...proj,
    };

    profile.projects.push(newProj);
    const updated = await profile.save();
    await this.invalidateCache(userId);

    const event = createEvent('profile.project.updated', this.sourceName, { userId, action: 'ADD', projectId: newProj.id });
    await this.eventBus.publish('profile.project.updated', event);

    await this.metadataRepo.createAuditLog({
      userId,
      action: 'PROJECT_ADDED',
      entityName: 'ProfileProject',
      entityId: newProj.id,
      ipAddress,
      userAgent,
      details: { title: proj.title },
    });

    await this.metadataRepo.createProfileEvent({
      userId,
      eventType: 'profile.project.added',
      ipAddress,
      userAgent,
      details: { title: proj.title },
    });

    return updated;
  }

  async updateProject(
    userId: string,
    projId: string,
    projUpdates: Partial<IProject>,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<IProfile> {
    const profile = await this.getProfile(userId);
    const index = profile.projects.findIndex((e) => e.id === projId);
    if (index === -1) {
      throw ErrorFactory.notFound('Project entry not found');
    }

    const merged = { ...profile.projects[index], ...projUpdates };
    profile.projects[index] = merged as IProject;
    const updated = await profile.save();
    await this.invalidateCache(userId);

    const event = createEvent('profile.project.updated', this.sourceName, { userId, action: 'UPDATE', projectId: projId });
    await this.eventBus.publish('profile.project.updated', event);

    await this.metadataRepo.createAuditLog({
      userId,
      action: 'PROJECT_UPDATED',
      entityName: 'ProfileProject',
      entityId: projId,
      ipAddress,
      userAgent,
      details: { title: merged.title },
    });

    return updated;
  }

  async deleteProject(
    userId: string,
    projId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<IProfile> {
    const profile = await this.getProfile(userId);
    const index = profile.projects.findIndex((e) => e.id === projId);
    if (index === -1) {
      throw ErrorFactory.notFound('Project entry not found');
    }

    const deleted = profile.projects[index];
    if (!deleted) {
      throw ErrorFactory.notFound('Project entry not found');
    }
    profile.projects.splice(index, 1);
    const updated = await profile.save();
    await this.invalidateCache(userId);

    const event = createEvent('profile.project.updated', this.sourceName, { userId, action: 'DELETE', projectId: projId });
    await this.eventBus.publish('profile.project.updated', event);

    await this.metadataRepo.createAuditLog({
      userId,
      action: 'PROJECT_DELETED',
      entityName: 'ProfileProject',
      entityId: projId,
      ipAddress,
      userAgent,
      details: { title: deleted.title },
    });

    return updated;
  }

  // ─── Certifications CRUD ────────────────────────────
  async addCertification(
    userId: string,
    cert: Omit<ICertification, 'id'>,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<IProfile> {
    const profile = await this.getProfile(userId);

    const duplicate = profile.certifications.find(
      (c) =>
        c.name.toLowerCase() === cert.name.toLowerCase() &&
        c.issuer.toLowerCase() === cert.issuer.toLowerCase(),
    );
    if (duplicate) {
      throw ErrorFactory.conflict('Certification already exists');
    }

    const newCert: ICertification = {
      id: crypto.randomUUID(),
      ...cert,
    };

    profile.certifications.push(newCert);
    const updated = await profile.save();
    await this.invalidateCache(userId);

    const event = createEvent('profile.updated', this.sourceName, { userId });
    await this.eventBus.publish('profile.updated', event);

    await this.metadataRepo.createAuditLog({
      userId,
      action: 'CERTIFICATION_ADDED',
      entityName: 'ProfileCertification',
      entityId: newCert.id,
      ipAddress,
      userAgent,
      details: { name: cert.name },
    });

    await this.metadataRepo.createProfileEvent({
      userId,
      eventType: 'profile.certification.added',
      ipAddress,
      userAgent,
      details: { name: cert.name, issuer: cert.issuer },
    });

    return updated;
  }

  async updateCertification(
    userId: string,
    certId: string,
    certUpdates: Partial<ICertification>,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<IProfile> {
    const profile = await this.getProfile(userId);
    const index = profile.certifications.findIndex((e) => e.id === certId);
    if (index === -1) {
      throw ErrorFactory.notFound('Certification not found');
    }

    const merged = { ...profile.certifications[index], ...certUpdates };

    const duplicate = profile.certifications.find(
      (c) =>
        c.id !== certId &&
        c.name.toLowerCase() === (merged.name ?? '').toLowerCase() &&
        c.issuer.toLowerCase() === (merged.issuer ?? '').toLowerCase(),
    );
    if (duplicate) {
      throw ErrorFactory.conflict('Another matching certification entry already exists');
    }

    profile.certifications[index] = merged as ICertification;
    const updated = await profile.save();
    await this.invalidateCache(userId);

    const event = createEvent('profile.updated', this.sourceName, { userId });
    await this.eventBus.publish('profile.updated', event);

    await this.metadataRepo.createAuditLog({
      userId,
      action: 'CERTIFICATION_UPDATED',
      entityName: 'ProfileCertification',
      entityId: certId,
      ipAddress,
      userAgent,
      details: { name: merged.name },
    });

    return updated;
  }

  async deleteCertification(
    userId: string,
    certId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<IProfile> {
    const profile = await this.getProfile(userId);
    const index = profile.certifications.findIndex((e) => e.id === certId);
    if (index === -1) {
      throw ErrorFactory.notFound('Certification not found');
    }

    const deleted = profile.certifications[index];
    if (!deleted) {
      throw ErrorFactory.notFound('Certification not found');
    }
    profile.certifications.splice(index, 1);
    const updated = await profile.save();
    await this.invalidateCache(userId);

    const event = createEvent('profile.updated', this.sourceName, { userId });
    await this.eventBus.publish('profile.updated', event);

    await this.metadataRepo.createAuditLog({
      userId,
      action: 'CERTIFICATION_DELETED',
      entityName: 'ProfileCertification',
      entityId: certId,
      ipAddress,
      userAgent,
      details: { name: deleted.name },
    });

    return updated;
  }

  /**
   * Retrieves profile activity timeline from PostgreSQL profileEvents table.
   */
  async getActivityTimeline(userId: string): Promise<any[]> {
    return this.metadataRepo.findProfileEventsByUserId(userId);
  }
}
