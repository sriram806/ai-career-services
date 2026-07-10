import { eq, desc } from 'drizzle-orm';
import {
  resumeMetadata,
  profileEvents,
  profileVersions,
  uploads,
  auditLogs,
} from '@ai-career-os/database';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

export class MetadataRepository {
  constructor(private readonly db: NodePgDatabase) {}

  // ─── Resume Metadata ──────────────────────────────
  async createResumeMetadata(data: {
    userId: string;
    fileName: string;
    fileSize: number;
    mimeType?: string;
    filePath?: string;
    parsedData?: Record<string, any>;
    status?: string;
  }): Promise<any> {
    const [result] = await this.db
      .insert(resumeMetadata)
      .values({
        userId: data.userId,
        fileName: data.fileName,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
        filePath: data.filePath,
        parsedData: data.parsedData ?? {},
        status: data.status ?? 'uploaded',
      })
      .returning();
    return result;
  }

  async findResumeMetadataByUserId(userId: string): Promise<any[]> {
    return this.db
      .select()
      .from(resumeMetadata)
      .where(eq(resumeMetadata.userId, userId))
      .orderBy(desc(resumeMetadata.createdAt));
  }

  // ─── Profile Events ───────────────────────────────
  async createProfileEvent(data: {
    userId: string;
    eventType: string;
    ipAddress?: string;
    userAgent?: string;
    details?: Record<string, any>;
  }): Promise<void> {
    await this.db.insert(profileEvents).values({
      userId: data.userId,
      eventType: data.eventType,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      details: data.details ?? {},
    });
  }

  async findProfileEventsByUserId(userId: string): Promise<any[]> {
    return this.db
      .select()
      .from(profileEvents)
      .where(eq(profileEvents.userId, userId))
      .orderBy(desc(profileEvents.createdAt));
  }

  // ─── Profile Versions ─────────────────────────────
  async createProfileVersion(data: {
    userId: string;
    version: number;
    profileData: Record<string, any>;
    createdBy?: string;
  }): Promise<void> {
    await this.db.insert(profileVersions).values({
      userId: data.userId,
      version: data.version,
      profileData: data.profileData,
      createdBy: data.createdBy,
    });
  }

  async findLatestProfileVersion(userId: string): Promise<any | null> {
    const results = await this.db
      .select()
      .from(profileVersions)
      .where(eq(profileVersions.userId, userId))
      .orderBy(desc(profileVersions.version))
      .limit(1);
    return results[0] ?? null;
  }

  // ─── Uploads ──────────────────────────────────────
  async createUpload(data: {
    userId: string;
    uploadType: string;
    fileName: string;
    fileSize: number;
    mimeType?: string;
    filePath?: string;
    meta?: Record<string, any>;
  }): Promise<any> {
    const [result] = await this.db
      .insert(uploads)
      .values({
        userId: data.userId,
        uploadType: data.uploadType,
        fileName: data.fileName,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
        filePath: data.filePath,
        meta: data.meta ?? {},
      })
      .returning();
    return result;
  }

  async findUploadsByUserId(userId: string): Promise<any[]> {
    return this.db
      .select()
      .from(uploads)
      .where(eq(uploads.userId, userId))
      .orderBy(desc(uploads.createdAt));
  }

  // ─── Audit Logs ───────────────────────────────────
  async createAuditLog(data: {
    userId: string | null;
    action: string;
    entityName: string;
    entityId?: string;
    ipAddress?: string;
    userAgent?: string;
    details?: Record<string, any>;
  }): Promise<void> {
    await this.db.insert(auditLogs).values({
      userId: data.userId,
      action: data.action,
      entityName: data.entityName,
      entityId: data.entityId,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      details: data.details ?? {},
    });
  }

  async findAuditLogsByUserId(userId: string): Promise<any[]> {
    return this.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.userId, userId))
      .orderBy(desc(auditLogs.createdAt));
  }
}
