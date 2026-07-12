import { FastifyRequest, FastifyReply } from 'fastify';
import { ProfileController } from '../controllers/profile.controller';
import { JwtService } from '../services/jwt.service';
import { ErrorFactory } from '@ai-career-os/errors';

export function registerProfileRoutes(
  fastify: any,
  controller: ProfileController,
  jwtService: JwtService,
) {
  // ─── JWT Authentication Pre-Handler ──────────────
  const authenticate = async (request: FastifyRequest, _reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      throw ErrorFactory.unauthorized('Authorization header is missing');
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw ErrorFactory.unauthorized('Invalid authorization format');
    }

    try {
      const payload = jwtService.verifyAccessToken(token);
      (request as any).user = {
        userId: payload.sub,
        email: payload.email,
        roles: payload.roles || [payload.role],
        permissions: payload.permissions || [],
        sessionId: payload.sessionId,
      };
    } catch (err: any) {
      throw ErrorFactory.unauthorized('Invalid or expired access token');
    }
  };

  // ─── Base Profile Routes ──────────────────────────
  fastify.get('/profile/me', { preHandler: [authenticate] }, (req: FastifyRequest, rep: FastifyReply) => controller.getProfileMe(req, rep));
  fastify.patch('/profile', { preHandler: [authenticate] }, (req: FastifyRequest, rep: FastifyReply) => controller.updateProfile(req, rep));
  fastify.get('/profile/completion', { preHandler: [authenticate] }, (req: FastifyRequest, rep: FastifyReply) => controller.getCompletion(req, rep));

  // ─── Convenience Routes (flat body → nested profile) ─────────────────────
  fastify.patch('/profile/basics', { preHandler: [authenticate] }, (req: FastifyRequest, rep: FastifyReply) => controller.updateBasics(req, rep));
  fastify.patch('/profile/career', { preHandler: [authenticate] }, (req: FastifyRequest, rep: FastifyReply) => controller.updateCareerPreferences(req, rep));

  // ─── Profile Avatar & Banner Media ───────────────
  fastify.post('/profile/avatar', { preHandler: [authenticate] }, (req: FastifyRequest, rep: FastifyReply) => controller.uploadAvatar(req, rep));
  fastify.delete('/profile/avatar', { preHandler: [authenticate] }, (req: FastifyRequest, rep: FastifyReply) => controller.deleteAvatar(req, rep));
  fastify.post('/profile/banner', { preHandler: [authenticate] }, (req: FastifyRequest, rep: FastifyReply) => controller.uploadBanner(req, rep));
  fastify.delete('/profile/banner', { preHandler: [authenticate] }, (req: FastifyRequest, rep: FastifyReply) => controller.deleteBanner(req, rep));

  // ─── Profile Education CRUD ────────────────────────
  fastify.post('/profile/education', { preHandler: [authenticate] }, (req: FastifyRequest, rep: FastifyReply) => controller.addEducation(req, rep));
  fastify.patch('/profile/education/:id', { preHandler: [authenticate] }, (req: FastifyRequest, rep: FastifyReply) => controller.updateEducation(req, rep));
  fastify.delete('/profile/education/:id', { preHandler: [authenticate] }, (req: FastifyRequest, rep: FastifyReply) => controller.deleteEducation(req, rep));

  // ─── Profile Experience CRUD ───────────────────────
  fastify.post('/profile/experience', { preHandler: [authenticate] }, (req: FastifyRequest, rep: FastifyReply) => controller.addExperience(req, rep));
  fastify.patch('/profile/experience/:id', { preHandler: [authenticate] }, (req: FastifyRequest, rep: FastifyReply) => controller.updateExperience(req, rep));
  fastify.delete('/profile/experience/:id', { preHandler: [authenticate] }, (req: FastifyRequest, rep: FastifyReply) => controller.deleteExperience(req, rep));

  // ─── Profile Projects CRUD ─────────────────────────
  fastify.post('/profile/project', { preHandler: [authenticate] }, (req: FastifyRequest, rep: FastifyReply) => controller.addProject(req, rep));
  fastify.patch('/profile/project/:id', { preHandler: [authenticate] }, (req: FastifyRequest, rep: FastifyReply) => controller.updateProject(req, rep));
  fastify.delete('/profile/project/:id', { preHandler: [authenticate] }, (req: FastifyRequest, rep: FastifyReply) => controller.deleteProject(req, rep));

  // ─── Profile Certifications CRUD ───────────────────
  fastify.post('/profile/certification', { preHandler: [authenticate] }, (req: FastifyRequest, rep: FastifyReply) => controller.addCertification(req, rep));
  fastify.patch('/profile/certification/:id', { preHandler: [authenticate] }, (req: FastifyRequest, rep: FastifyReply) => controller.updateCertification(req, rep));
  fastify.delete('/profile/certification/:id', { preHandler: [authenticate] }, (req: FastifyRequest, rep: FastifyReply) => controller.deleteCertification(req, rep));

  // ─── Profile Social Links ──────────────────────────
  fastify.post('/profile/social-links', { preHandler: [authenticate] }, (req: FastifyRequest, rep: FastifyReply) => controller.updateSocialLinks(req, rep));
  fastify.patch('/profile/social-links', { preHandler: [authenticate] }, (req: FastifyRequest, rep: FastifyReply) => controller.updateSocialLinks(req, rep));

  // ─── Profile Activity Timeline ─────────────────────
  fastify.get('/profile/activity', { preHandler: [authenticate] }, (req: FastifyRequest, rep: FastifyReply) => controller.getActivityTimeline(req, rep));
}
