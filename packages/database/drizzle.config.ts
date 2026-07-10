import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: 'postgresql://ai_career_os:changeme_postgres@localhost:5432/ai_career_os',
  },
});
