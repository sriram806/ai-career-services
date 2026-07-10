import { IProfile } from '../schemas/profile.schema';

export interface CompletionResult {
  overallPercentage: number;
  completedSections: string[];
  missingSections: string[];
  recommendations: string[];
  futureAiSuggestions: string[];
}

export class ProfileCompletionEngine {
  private readonly weights = {
    basics: 20,
    avatar: 10,
    education: 15,
    skillsAndLanguages: 15,
    experienceOrProjects: 15,
    location: 10,
    socialLinks: 15,
  };

  calculateCompletion(profile: IProfile | null): CompletionResult {
    const completedSections: string[] = [];
    const missingSections: string[] = [];
    const recommendations: string[] = [];
    const futureAiSuggestions: string[] = [
      'Placeholder: Sync GitHub profile to unlock automatic AI Skill Gap Analysis',
      'Placeholder: Complete cover letter and resume info to initialize AI Resume Tailoring',
      'Placeholder: Add mock preferences to run AI Interview Simulator',
    ];

    if (!profile) {
      return {
        overallPercentage: 0,
        completedSections: [],
        missingSections: Object.keys(this.weights),
        recommendations: ['Create your profile to start calculating completion score'],
        futureAiSuggestions,
      };
    }

    let score = 0;

    // 1. Basics (name, headline, bio, phone)
    const hasBasics = !!(
      profile.basics?.name &&
      profile.basics?.headline &&
      profile.basics?.bio &&
      profile.basics?.phone
    );
    if (hasBasics) {
      score += this.weights.basics;
      completedSections.push('basics');
    } else {
      missingSections.push('basics');
      recommendations.push('Complete your basic info (name, headline, bio, phone) to make your profile stand out.');
    }

    // 2. Avatar
    const hasAvatar = !!profile.basics?.avatarUrl;
    if (hasAvatar) {
      score += this.weights.avatar;
      completedSections.push('avatar');
    } else {
      missingSections.push('avatar');
      recommendations.push('Upload a professional profile photo (avatar) to increase recruiter response rate by up to 3x.');
    }

    // 3. Education
    const hasEducation = profile.education && profile.education.length > 0;
    if (hasEducation) {
      score += this.weights.education;
      completedSections.push('education');
    } else {
      missingSections.push('education');
      recommendations.push('Add at least one educational milestone to showcase your academic credentials.');
    }

    // 4. Skills & Languages
    const hasSkillsAndLanguages = (profile.skills && profile.skills.length > 0) || (profile.languages && profile.languages.length > 0);
    if (hasSkillsAndLanguages) {
      score += this.weights.skillsAndLanguages;
      completedSections.push('skillsAndLanguages');
    } else {
      missingSections.push('skillsAndLanguages');
      recommendations.push('List your technical skills and languages spoken to help AI matching and recruiter discovery.');
    }

    // 5. Experience or Projects
    const hasExpOrProj = (profile.experience && profile.experience.length > 0) || (profile.projects && profile.projects.length > 0);
    if (hasExpOrProj) {
      score += this.weights.experienceOrProjects;
      completedSections.push('experienceOrProjects');
    } else {
      missingSections.push('experienceOrProjects');
      recommendations.push('Add either a work experience entry or a technical project to demonstrate hands-on ability.');
    }

    // 6. Location
    const hasLocation = !!(profile.location?.country && profile.location?.city);
    if (hasLocation) {
      score += this.weights.location;
      completedSections.push('location');
    } else {
      missingSections.push('location');
      recommendations.push('Provide your location (city & country) to display in localized recruiter searches.');
    }

    // 7. Social Links
    const hasSocial = !!(profile.socialLinks?.github || profile.socialLinks?.linkedin);
    if (hasSocial) {
      score += this.weights.socialLinks;
      completedSections.push('socialLinks');
    } else {
      missingSections.push('socialLinks');
      recommendations.push('Link your GitHub or LinkedIn accounts to verify your online professional portfolio.');
    }

    return {
      overallPercentage: score,
      completedSections,
      missingSections,
      recommendations,
      futureAiSuggestions,
    };
  }
}
