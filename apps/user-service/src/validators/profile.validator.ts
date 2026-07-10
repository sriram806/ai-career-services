import { z } from 'zod';

const phoneRegex = /^\+?[0-9\s\-()]{10,20}$/;

export const basicInfoValidator = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100).optional(),
  headline: z.string().max(200).optional(),
  bio: z.string().max(1000).optional(),
  phone: z.string().regex(phoneRegex, 'Invalid phone number format').optional().or(z.literal('')),
  dateOfBirth: z.string().datetime().optional().or(z.literal('')),
  gender: z.string().optional(),
  avatarUrl: z.string().url('Invalid avatar URL').optional().or(z.literal('')),
  bannerUrl: z.string().url('Invalid banner URL').optional().or(z.literal('')),
});

export const locationValidator = z.object({
  country: z.string().min(1, 'Country cannot be empty').optional(),
  state: z.string().optional(),
  city: z.string().min(1, 'City cannot be empty').optional(),
});

export const careerPreferencesValidator = z.object({
  careerGoal: z.string().max(500).optional(),
  preferredRoles: z.array(z.string()).default([]),
  employmentType: z.string().optional(),
  expectedSalary: z.string().optional(),
  preferredLocations: z.array(z.string()).default([]),
  workMode: z.enum(['Remote', 'Hybrid', 'Onsite', 'Flexible']).optional(),
  availability: z.string().optional(),
});

export const socialLinksValidator = z.object({
  github: z.string().url('Invalid GitHub URL').regex(/github\.com/, 'Must be a GitHub URL').optional().or(z.literal('')),
  linkedin: z.string().url('Invalid LinkedIn URL').regex(/linkedin\.com/, 'Must be a LinkedIn URL').optional().or(z.literal('')),
  twitter: z.string().url('Invalid Twitter URL').regex(/(twitter\.com|x\.com)/, 'Must be a Twitter/X URL').optional().or(z.literal('')),
  portfolio: z.string().url('Invalid portfolio URL').optional().or(z.literal('')),
  website: z.string().url('Invalid website URL').optional().or(z.literal('')),
  kaggle: z.string().url('Invalid Kaggle URL').regex(/kaggle\.com/, 'Must be a Kaggle URL').optional().or(z.literal('')),
  leetcode: z.string().url('Invalid LeetCode URL').regex(/leetcode\.com/, 'Must be a LeetCode URL').optional().or(z.literal('')),
});

export const preferencesValidator = z.object({
  profileVisibility: z.enum(['public', 'private', 'recruiters']).optional(),
  searchEngineIndexing: z.boolean().optional(),
  recruiterDiscovery: z.boolean().optional(),
  notifications: z.record(z.any()).optional(),
});

export const patchProfileValidator = z.object({
  basics: basicInfoValidator.optional(),
  location: locationValidator.optional(),
  careerPreferences: careerPreferencesValidator.optional(),
  socialLinks: socialLinksValidator.optional(),
  preferences: preferencesValidator.optional(),
});

export const educationValidator = z.object({
  university: z.string().min(1, 'University name is required').max(200),
  degree: z.string().max(100).optional(),
  specialization: z.string().max(100).optional(),
  graduationYear: z.string().regex(/^\d{4}$/, 'Graduation year must be a 4-digit number').optional().or(z.literal('')),
  startDate: z.string().optional().or(z.literal('')),
  endDate: z.string().optional().or(z.literal('')),
  gpa: z.string().max(10).optional().or(z.literal('')),
});

export const experienceValidator = z.object({
  company: z.string().min(1, 'Company name is required').max(200),
  role: z.string().min(1, 'Role title is required').max(100),
  location: z.string().max(100).optional(),
  startDate: z.string().optional().or(z.literal('')),
  endDate: z.string().optional().or(z.literal('')),
  isCurrent: z.boolean().default(false),
  description: z.string().max(2000).optional(),
});

export const projectValidator = z.object({
  title: z.string().min(1, 'Project title is required').max(200),
  description: z.string().max(1000).optional(),
  technologies: z.array(z.string()).default([]),
  url: z.string().url('Invalid URL').optional().or(z.literal('')),
  githubUrl: z.string().url('Invalid GitHub URL').optional().or(z.literal('')),
});

export const certificationValidator = z.object({
  name: z.string().min(1, 'Certification name is required').max(200),
  issuer: z.string().min(1, 'Certification issuer is required').max(100),
  issueDate: z.string().optional().or(z.literal('')),
  expiryDate: z.string().optional().or(z.literal('')),
  credentialId: z.string().max(100).optional().or(z.literal('')),
  credentialUrl: z.string().url('Invalid credential URL').optional().or(z.literal('')),
});
