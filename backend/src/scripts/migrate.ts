#!/usr/bin/env node

import { getPool, closePool } from '../config/database.js';
import { DatabaseMigrator } from '../database/migrator.js';

async function main() {
  const command = process.argv[2];
  const pool = getPool();
  const migrator = new DatabaseMigrator(pool);

  try {
    switch (command) {
      case 'up':
      case 'migrate':
        await migrator.migrate();
        break;

      case 'status':
        const status = await migrator.getStatus();
        console.log('\n📊 Migration Status:');
        console.log(`Total migrations: ${status.total}`);
        console.log(`Applied: ${status.applied}`);
        console.log(`Pending: ${status.pending.length}`);
        
        if (status.pending.length > 0) {
          console.log('\n📋 Pending migrations:');
          status.pending.forEach(migration => {
            console.log(`  - ${migration}`);
          });
        }
        break;

      case 'reset':
        console.log('⚠️  This will delete all data in the database!');
        console.log('Type "yes" to confirm:');
        
        process.stdin.setEncoding('utf8');
        process.stdin.on('readable', async () => {
          const chunk = process.stdin.read();
          if (chunk !== null) {
            const input = chunk.toString().trim();
            if (input === 'yes') {
              await migrator.reset();
              await migrator.migrate();
              process.exit(0);
            } else {
              console.log('❌ Reset cancelled');
              process.exit(1);
            }
          }
        });
        break;

      default:
        console.log(`
🗄️  Database Migration Tool

Usage: npm run migrate <command>

Commands:
  up, migrate    Run all pending migrations
  status         Show migration status
  reset          Reset database and run all migrations (DESTRUCTIVE)

Examples:
  npm run migrate up
  npm run migrate status
  npm run migrate reset
        `);
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\n🛑 Migration interrupted');
  await closePool();
  process.exit(1);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Migration terminated');
  await closePool();
  process.exit(1);
});

main().catch(async (error) => {
  console.error('❌ Unexpected error:', error);
  await closePool();
  process.exit(1);
});