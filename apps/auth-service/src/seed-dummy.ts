import * as argon2 from 'argon2';
import { loadConfig, getConfig } from '@ai-career-os/config';
import { createLogger } from '@ai-career-os/logger';
import { PostgresConnection, users, credentials } from '@ai-career-os/database';
import { eq } from 'drizzle-orm';

async function seed() {
  loadConfig();
  const config = getConfig();
  const logger = createLogger('seed-dummy');

  const postgres = new PostgresConnection(
    {
      host: config.POSTGRES_HOST,
      port: config.POSTGRES_PORT,
      user: config.POSTGRES_USER,
      password: config.POSTGRES_PASSWORD,
      database: config.POSTGRES_DB,
    },
    logger,
  );

  const db = await postgres.connect();
  console.log('Connected to database.');

  const passwordPlain = 'Password@12345';
  console.log(`Hashing password: ${passwordPlain}`);
  const passwordHash = await argon2.hash(passwordPlain, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const dummyUsers = [
    {
      email: 'candidate@aicareer.os',
      username: 'dummy_candidate',
      fullName: 'Dummy Candidate',
      role: 'candidate',
    },
    {
      email: 'admin@aicareer.os',
      username: 'dummy_admin',
      fullName: 'Dummy Admin',
      role: 'super_administrator',
    },
  ];

  for (const dummyUser of dummyUsers) {
    // Check if user already exists
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, dummyUser.email))
      .limit(1);

    if (existing.length > 0) {
      console.log(`User ${dummyUser.email} already exists. Skipping.`);
      continue;
    }

    // Insert user
    const result = await db
      .insert(users)
      .values({
        email: dummyUser.email,
        username: dummyUser.username,
        fullName: dummyUser.fullName,
        role: dummyUser.role,
        status: 'active',
        emailVerified: true,
      })
      .returning();

    const insertedUser = result[0];
    if (!insertedUser) {
      throw new Error(`Failed to insert user ${dummyUser.email}`);
    }

    // Insert credentials
    await db.insert(credentials).values({
      userId: insertedUser.id,
      passwordHash,
    });

    console.log(`Successfully seeded user: ${dummyUser.email} with role: ${dummyUser.role}`);
  }

  await postgres.disconnect();
  console.log('Seeding complete. Disconnected.');
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
