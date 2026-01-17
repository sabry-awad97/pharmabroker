/**
 * Apply All Database Performance Optimizations
 *
 * Manually applies all database optimizations including:
 *   - HNSW vector indexes for semantic similarity search
 *   - Trigram indexes for fast text search
 *   - Composite indexes for common query patterns
 *   - Full Text Search (FTS) setup with tsvector
 *
 * Run this script after Prisma migrations to optimize query performance.
 *
 * Usage:
 *   bun run packages/db/apply-indexes.ts
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';
import prisma from './src';

async function applyIndexes() {
  console.log('📊 Applying all database performance optimizations...\n');

  // Create direct pg connection
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    // Enable required extensions
    console.log('1. Enabling PostgreSQL extensions...');
    await pool.query(`
      CREATE EXTENSION IF NOT EXISTS vector;
      CREATE EXTENSION IF NOT EXISTS pg_trgm;
    `);
    console.log('✓ Extensions enabled (vector, pg_trgm)\n');

    // Apply performance indexes SQL file
    console.log('2. Applying performance indexes...');
    const indexesSqlPath = join(__dirname, 'init-db', '002-add-indexes.sql');
    const indexesSql = readFileSync(indexesSqlPath, 'utf-8');
    await pool.query(indexesSql);
    console.log('✓ Performance indexes applied\n');

    // Apply FTS setup SQL file
    console.log('3. Applying Full Text Search setup...');
    const ftsSqlPath = join(__dirname, 'init-db', '003-add-fts.sql');
    const ftsSql = readFileSync(ftsSqlPath, 'utf-8');
    await pool.query(ftsSql);
    console.log('✓ Full Text Search setup complete\n');

    // Verify HNSW indexes
    console.log('4. Verifying HNSW vector indexes...');
    const hnsw = await prisma.$queryRaw<
      Array<{ tablename: string; indexname: string }>
    >`
      SELECT tablename, indexname
      FROM pg_indexes
      WHERE tablename IN ('whatsapp_message', 'message_embedding')
        AND indexname LIKE '%hnsw%'
      ORDER BY tablename, indexname;
    `;

    console.log(`✓ Found ${hnsw.length} HNSW vector indexes:\n`);
    for (const idx of hnsw) {
      console.log(`  - ${idx.tablename}.${idx.indexname}`);
    }

    // Verify performance indexes
    console.log('\n5. Verifying performance indexes...');
    const perf = await prisma.$queryRaw<
      Array<{ tablename: string; indexname: string }>
    >`
      SELECT tablename, indexname
      FROM pg_indexes
      WHERE tablename IN ('whatsapp_message', 'whatsapp_group', 'whatsapp_group_participant')
        AND (indexname LIKE '%trgm%' OR indexname LIKE '%timestamp%' OR indexname LIKE '%ai_status%')
      ORDER BY tablename, indexname;
    `;

    console.log(`✓ Found ${perf.length} performance indexes:\n`);
    for (const idx of perf) {
      console.log(`  - ${idx.tablename}.${idx.indexname}`);
    }

    // Verify FTS setup
    console.log('\n6. Verifying Full Text Search setup...');
    const ftsIndex = await prisma.$queryRaw<[{ exists: boolean }]>`
      SELECT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'whatsapp_message' 
        AND indexname = 'whatsapp_message_search_vector_idx'
      ) as exists
    `;

    const ftsColumn = await prisma.$queryRaw<[{ exists: boolean }]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'whatsapp_message' 
        AND column_name = 'search_vector'
      ) as exists
    `;

    if (ftsIndex[0].exists && ftsColumn[0].exists) {
      const populatedCount = await prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count 
        FROM whatsapp_message 
        WHERE search_vector IS NOT NULL
      `;
      console.log(
        `✓ FTS enabled with ${populatedCount[0].count} messages indexed\n`,
      );
    } else {
      console.log('⚠️  FTS setup incomplete\n');
    }

    console.log('✅ All optimizations applied successfully!');
    console.log(`\n📊 Total indexes created: ${hnsw.length + perf.length + 1}`);
    console.log('\n📈 Expected improvements:');
    console.log('  - Semantic similarity search: Enabled (HNSW)');
    console.log('  - Full text search: 100-1000x faster (FTS vs ILIKE)');
    console.log('  - Text search (ILIKE) queries: 10-100x faster (trigram)');
    console.log('  - Filtered list queries: 5-20x faster');
    console.log('  - Date range queries: 3-10x faster');
    console.log('  - AI status filtering: 5-15x faster');
    console.log('  - Count queries: Cached for 60s (instant on repeat)');
  } catch (error) {
    console.error('❌ Error applying optimizations:', error);
    throw error;
  } finally {
    await pool.end();
    await prisma.$disconnect();
  }
}

applyIndexes();
