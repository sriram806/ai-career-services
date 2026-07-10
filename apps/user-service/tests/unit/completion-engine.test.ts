import { describe, it, expect } from 'vitest';
import { ProfileCompletionEngine } from '../../src/services/completion-engine.service';
import { IProfile } from '../../src/schemas/profile.schema';

describe('ProfileCompletionEngine', () => {
  const engine = new ProfileCompletionEngine();

  it('should return 0% for null or empty profile', () => {
    const result = engine.calculateCompletion(null);
    expect(result.overallPercentage).toBe(0);
    expect(result.completedSections.length).toBe(0);
    expect(result.missingSections).toContain('basics');
  });

  it('should calculate partial completion correctly', () => {
    const mockProfile = {
      basics: {
        name: 'Sriram',
        headline: 'AI Engineer',
        bio: 'Passionate about deep learning',
        phone: '+919876543210',
      },
      skills: ['Python', 'TypeScript'],
      education: [],
      experience: [],
      projects: [],
      socialLinks: {},
      location: {},
    } as unknown as IProfile;

    const result = engine.calculateCompletion(mockProfile);
    // Basics: 20%, Skills & Languages: 15% -> 35%
    expect(result.overallPercentage).toBe(35);
    expect(result.completedSections).toContain('basics');
    expect(result.completedSections).toContain('skillsAndLanguages');
    expect(result.missingSections).toContain('education');
  });

  it('should return 100% when all sections are fully completed', () => {
    const mockFullProfile = {
      basics: {
        name: 'Sriram',
        headline: 'AI Engineer',
        bio: 'Passionate about deep learning',
        phone: '+919876543210',
        avatarUrl: 'https://example.com/avatar.png',
      },
      location: {
        country: 'India',
        city: 'Hyderabad',
      },
      education: [
        { university: 'IIT', degree: 'BTech', graduationYear: '2025' }
      ],
      skills: ['Python'],
      experience: [
        { company: 'Google', role: 'Software Engineer' }
      ],
      socialLinks: {
        github: 'https://github.com/sriram',
        linkedin: 'https://linkedin.com/in/sriram',
      },
    } as unknown as IProfile;

    const result = engine.calculateCompletion(mockFullProfile);
    expect(result.overallPercentage).toBe(100);
    expect(result.missingSections.length).toBe(0);
    expect(result.completedSections.length).toBe(7);
  });
});
