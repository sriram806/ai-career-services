ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "position" varchar(100) DEFAULT 'Candidate';
