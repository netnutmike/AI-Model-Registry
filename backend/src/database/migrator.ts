import { Pool } from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface Migration {
  id: string;
  filename: string;
  sql: string;
  appliedAt?: Date;
}

export class DatabaseMigrator {
  private pool: Pool;
  private migrationsPath: string;

  constructor(pool: Pool) {
    this.pool = pool;
    this.migrationsPath = join(__dirname, 'migrations');
  }

  /**
   * Initialize the migrations table
   */
  async initializeMigrationsTable(): Promise<void> {
    const sql = `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id VARCHAR(255) PRIMARY KEY,
        filename VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        checksum VARCHAR(64) NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at 
        ON schema_migrations(applied_at);
    `;

    await this.pool.query(sql);
  }

  /**
   * Get all migration files from the migrations directory
   */
  getMigrationFiles(): Migration[] {
    const files = readdirSync(this.migrationsPath)
      .filter(file => file.endsWith('.sql'))
      .sort();

    return files.map(filename => {
      const id = filename.replace('.sql', '');
      const filepath = join(this.migrationsPath, filename);
      const sql = readFileSync(filepath, 'utf-8');

      return {
        id,
        filename,
        sql
      };
    });
  }

  /**
   * Get applied migrations from the database
   */
  async getAppliedMigrations(): Promise<Set<string>> {
    const result = await this.pool.query(
      'SELECT id FROM schema_migrations ORDER BY applied_at'
    );

    return new Set(result.rows.map(row => row.id));
  }

  /**
   * Calculate checksum for migration content
   */
  private calculateChecksum(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Apply a single migration
   */
  async applyMigration(migration: Migration): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Execute the migration SQL
      await client.query(migration.sql);

      // Record the migration as applied
      const checksum = this.calculateChecksum(migration.sql);
      await client.query(
        'INSERT INTO schema_migrations (id, filename, checksum) VALUES ($1, $2, $3)',
        [migration.id, migration.filename, checksum]
      );

      await client.query('COMMIT');
      console.log(`✅ Applied migration: ${migration.filename}`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`❌ Failed to apply migration: ${migration.filename}`);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Verify migration integrity by checking checksums
   */
  async verifyMigrationIntegrity(): Promise<boolean> {
    const migrations = this.getMigrationFiles();
    const result = await this.pool.query(
      'SELECT id, checksum FROM schema_migrations'
    );

    const appliedMigrations = new Map(
      result.rows.map(row => [row.id, row.checksum])
    );

    for (const migration of migrations) {
      const appliedChecksum = appliedMigrations.get(migration.id);
      if (appliedChecksum) {
        const currentChecksum = this.calculateChecksum(migration.sql);
        if (appliedChecksum !== currentChecksum) {
          console.error(`❌ Migration integrity check failed for: ${migration.filename}`);
          console.error(`Expected checksum: ${appliedChecksum}`);
          console.error(`Current checksum: ${currentChecksum}`);
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Run all pending migrations
   */
  async migrate(): Promise<void> {
    console.log('🔄 Starting database migration...');

    // Initialize migrations table
    await this.initializeMigrationsTable();

    // Verify existing migrations haven't been modified
    const integrityCheck = await this.verifyMigrationIntegrity();
    if (!integrityCheck) {
      throw new Error('Migration integrity check failed. Applied migrations have been modified.');
    }

    // Get migrations to apply
    const allMigrations = this.getMigrationFiles();
    const appliedMigrations = await this.getAppliedMigrations();
    
    const pendingMigrations = allMigrations.filter(
      migration => !appliedMigrations.has(migration.id)
    );

    if (pendingMigrations.length === 0) {
      console.log('✅ No pending migrations');
      return;
    }

    console.log(`📋 Found ${pendingMigrations.length} pending migrations`);

    // Apply each pending migration
    for (const migration of pendingMigrations) {
      await this.applyMigration(migration);
    }

    console.log('✅ Database migration completed successfully');
  }

  /**
   * Get migration status
   */
  async getStatus(): Promise<{
    total: number;
    applied: number;
    pending: string[];
  }> {
    const allMigrations = this.getMigrationFiles();
    const appliedMigrations = await this.getAppliedMigrations();
    
    const pending = allMigrations
      .filter(migration => !appliedMigrations.has(migration.id))
      .map(migration => migration.filename);

    return {
      total: allMigrations.length,
      applied: appliedMigrations.size,
      pending
    };
  }

  /**
   * Reset database (DROP ALL TABLES - USE WITH CAUTION)
   */
  async reset(): Promise<void> {
    console.log('⚠️  Resetting database - this will drop all tables!');
    
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Drop all tables in the public schema
      const result = await client.query(`
        SELECT tablename FROM pg_tables 
        WHERE schemaname = 'public'
      `);

      for (const row of result.rows) {
        await client.query(`DROP TABLE IF EXISTS "${row.tablename}" CASCADE`);
      }

      // Drop all types
      const typesResult = await client.query(`
        SELECT typname FROM pg_type 
        WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
        AND typtype = 'e'
      `);

      for (const row of typesResult.rows) {
        await client.query(`DROP TYPE IF EXISTS "${row.typname}" CASCADE`);
      }

      await client.query('COMMIT');
      console.log('✅ Database reset completed');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}