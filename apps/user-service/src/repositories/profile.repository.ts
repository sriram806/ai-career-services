import { ProfileModel, IProfile } from '../schemas/profile.schema';

export class ProfileRepository {
  async findByUserId(userId: string): Promise<IProfile | null> {
    return ProfileModel.findOne({ userId }).exec();
  }

  async create(userId: string, data: Partial<IProfile>): Promise<IProfile> {
    const profile = new ProfileModel({
      userId,
      ...data,
      basics: {
        ...data.basics,
      },
      location: {
        ...data.location,
      },
      education: data.education ?? [],
      experience: data.experience ?? [],
      skills: data.skills ?? [],
      languages: data.languages ?? [],
      projects: data.projects ?? [],
      certifications: data.certifications ?? [],
      achievements: data.achievements ?? [],
      careerPreferences: {
        preferredRoles: [],
        preferredLocations: [],
        ...data.careerPreferences,
      },
      socialLinks: {
        ...data.socialLinks,
      },
      portfolio: data.portfolio ?? [],
      metadata: {
        ...data.metadata,
      },
      preferences: {
        profileVisibility: 'public',
        searchEngineIndexing: true,
        recruiterDiscovery: true,
        notifications: {},
        ...data.preferences,
      },
    });

    return profile.save();
  }

  async updateByUserId(userId: string, data: Partial<IProfile>): Promise<IProfile | null> {
    return ProfileModel.findOneAndUpdate(
      { userId },
      { $set: data },
      { new: true, runValidators: true }
    ).exec();
  }

  async deleteByUserId(userId: string): Promise<boolean> {
    const result = await ProfileModel.deleteOne({ userId }).exec();
    return result.deletedCount > 0;
  }
}
