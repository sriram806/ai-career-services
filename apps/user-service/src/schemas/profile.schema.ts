import mongoose, { Schema, Document } from 'mongoose';
import crypto from 'node:crypto';

export interface IEducation {
  id: string;
  university: string;
  degree?: string;
  specialization?: string;
  graduationYear?: string;
  startDate?: string;
  endDate?: string;
  gpa?: string;
}

export interface IExperience {
  id: string;
  company: string;
  role: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  description?: string;
}

export interface IProject {
  id: string;
  title: string;
  description?: string;
  technologies?: string[];
  url?: string;
  githubUrl?: string;
}

export interface ICertification {
  id: string;
  name: string;
  issuer: string;
  issueDate?: string;
  expiryDate?: string;
  credentialId?: string;
  credentialUrl?: string;
}

export interface IAchievement {
  id: string;
  title: string;
  description?: string;
  date?: string;
}

export interface IPortfolioItem {
  id: string;
  title?: string;
  url: string;
  description?: string;
}

export interface IProfile extends Document {
  userId: string;
  basics: {
    name?: string;
    headline?: string;
    bio?: string;
    phone?: string;
    dateOfBirth?: string;
    gender?: string;
    avatarUrl?: string;
    bannerUrl?: string;
  };
  location: {
    country?: string;
    state?: string;
    city?: string;
  };
  education: IEducation[];
  experience: IExperience[];
  skills: string[];
  languages: string[];
  projects: IProject[];
  certifications: ICertification[];
  achievements: IAchievement[];
  careerPreferences: {
    careerGoal?: string;
    preferredRoles?: string[];
    employmentType?: string;
    expectedSalary?: string;
    preferredLocations?: string[];
    workMode?: 'Remote' | 'Hybrid' | 'Onsite' | 'Flexible';
    availability?: string;
  };
  socialLinks: {
    github?: string;
    linkedin?: string;
    twitter?: string;
    portfolio?: string;
    website?: string;
    kaggle?: string;
    leetcode?: string;
  };
  portfolio: IPortfolioItem[];
  metadata: {
    githubMetadata?: Record<string, any>;
    linkedinMetadata?: Record<string, any>;
    aiReadiness?: Record<string, any>;
    resumeUrl?: string;
    resumeFileName?: string;
  };
  preferences: {
    profileVisibility?: 'public' | 'private' | 'recruiters';
    searchEngineIndexing?: boolean;
    recruiterDiscovery?: boolean;
    notifications?: Record<string, any>;
  };
  createdAt: Date;
  updatedAt: Date;
}

const EducationSchema = new Schema<IEducation>({
  id: { type: String, default: () => crypto.randomUUID() },
  university: { type: String, required: true, trim: true },
  degree: { type: String, trim: true },
  specialization: { type: String, trim: true },
  graduationYear: { type: String, trim: true },
  startDate: { type: String },
  endDate: { type: String },
  gpa: { type: String, trim: true },
}, { _id: false });

const ExperienceSchema = new Schema<IExperience>({
  id: { type: String, default: () => crypto.randomUUID() },
  company: { type: String, required: true, trim: true },
  role: { type: String, required: true, trim: true },
  location: { type: String, trim: true },
  startDate: { type: String },
  endDate: { type: String },
  isCurrent: { type: Boolean, default: false },
  description: { type: String, trim: true },
}, { _id: false });

const ProjectSchema = new Schema<IProject>({
  id: { type: String, default: () => crypto.randomUUID() },
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  technologies: { type: [String], default: [] },
  url: { type: String, trim: true },
  githubUrl: { type: String, trim: true },
}, { _id: false });

const CertificationSchema = new Schema<ICertification>({
  id: { type: String, default: () => crypto.randomUUID() },
  name: { type: String, required: true, trim: true },
  issuer: { type: String, required: true, trim: true },
  issueDate: { type: String },
  expiryDate: { type: String },
  credentialId: { type: String, trim: true },
  credentialUrl: { type: String, trim: true },
}, { _id: false });

const AchievementSchema = new Schema<IAchievement>({
  id: { type: String, default: () => crypto.randomUUID() },
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  date: { type: String },
}, { _id: false });

const PortfolioItemSchema = new Schema<IPortfolioItem>({
  id: { type: String, default: () => crypto.randomUUID() },
  title: { type: String, trim: true },
  url: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
}, { _id: false });

export const ProfileSchema = new Schema<IProfile>({
  userId: { type: String, required: true, unique: true, index: true },
  basics: {
    name: { type: String, trim: true },
    headline: { type: String, trim: true },
    bio: { type: String, trim: true },
    phone: { type: String, trim: true },
    dateOfBirth: { type: String },
    gender: { type: String },
    avatarUrl: { type: String },
    bannerUrl: { type: String },
  },
  location: {
    country: { type: String, trim: true, index: true },
    state: { type: String, trim: true },
    city: { type: String, trim: true, index: true },
  },
  education: { type: [EducationSchema], default: [] },
  experience: { type: [ExperienceSchema], default: [] },
  skills: { type: [String], default: [], index: true },
  languages: { type: [String], default: [], index: true },
  projects: { type: [ProjectSchema], default: [] },
  certifications: { type: [CertificationSchema], default: [] },
  achievements: { type: [AchievementSchema], default: [] },
  careerPreferences: {
    careerGoal: { type: String, trim: true },
    preferredRoles: { type: [String], default: [], index: true },
    employmentType: { type: String, trim: true },
    expectedSalary: { type: String, trim: true },
    preferredLocations: { type: [String], default: [], index: true },
    workMode: { type: String, enum: ['Remote', 'Hybrid', 'Onsite', 'Flexible'] },
    availability: { type: String, trim: true },
  },
  socialLinks: {
    github: { type: String, trim: true },
    linkedin: { type: String, trim: true },
    twitter: { type: String, trim: true },
    portfolio: { type: String, trim: true },
    website: { type: String, trim: true },
    kaggle: { type: String, trim: true },
    leetcode: { type: String, trim: true },
  },
  portfolio: { type: [PortfolioItemSchema], default: [] },
  metadata: {
    githubMetadata: { type: Map, of: Schema.Types.Mixed },
    linkedinMetadata: { type: Map, of: Schema.Types.Mixed },
    aiReadiness: { type: Map, of: Schema.Types.Mixed },
    resumeUrl: { type: String },
    resumeFileName: { type: String },
  },
  preferences: {
    profileVisibility: { type: String, enum: ['public', 'private', 'recruiters'], default: 'public' },
    searchEngineIndexing: { type: Boolean, default: true },
    recruiterDiscovery: { type: Boolean, default: true },
    notifications: { type: Map, of: Schema.Types.Mixed, default: {} },
  },
}, {
  timestamps: true,
  collection: 'profiles',
});

// Setup multikey index for technologies used in projects
ProfileSchema.index({ 'projects.technologies': 1 });
// Setup index for university searching
ProfileSchema.index({ 'education.university': 1 });

export const ProfileModel = mongoose.model<IProfile>('Profile', ProfileSchema);
