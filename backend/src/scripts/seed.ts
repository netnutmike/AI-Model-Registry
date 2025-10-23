#!/usr/bin/env node

import { getPool, closePool } from '../config/database.js';
import { getDatabase } from '../database/index.js';
import { seedDevelopmentData } from '../database/seeds/development.js';

async function main() {
  const environment = process.argv[2] || 'development';
  
  console.log(`🌱 Seeding ${environment} data...`);
  
  const pool = getPool();
  const db = getDatabase();

  try {
    // Check if database is accessible
    const healthCheck = await db.healthCheck();
    if (healthCheck.status !== 'healthy') {
      throw new Error('Database is not healthy');
    }

    // Seed based on environment
    switch (environment) {
      case 'development':
      case 'dev':
        await seedDevelopmentData(db);
        break;
      
      case 'test':
        console.log('⚠️  Test environment seeding should be handled by test fixtures');
        break;
      
      default:
        console.error(`❌ Unknown environment: ${environment}`);
        console.log('Available environments: development, test');
        process.exit(1);
    }

    console.log('✅ Seeding completed successfully');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\n🛑 Seeding interrupted');
  await closePool();
  process.exit(1);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Seeding terminated');
  await closePool();
  process.exit(1);
});

main().catch(async (error) => {
  console.error('❌ Unexpected error:', error);
  await closePool();
  process.exit(1);
});