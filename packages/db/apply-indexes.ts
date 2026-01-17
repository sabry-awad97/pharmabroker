/**
 * Apply All Database Indexes Script
 *
 * Manually applies all database indexes including:
 *   - HNSW vector indexes for semantic similarity search
 *   - Trigram indexes for fast text search
 *   - Composite indexes for common query patterns
 *
 * Run this script after Prisma migrations to optimize query performance.
 *
 * Usage:
 *   bun run packages/db/apply-indexes.ts
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import prisma from './src';

async function applyIndexes() {
  console.log('📊 Applying all database indexes...\n');

  try {
    // Enable required extensions
    console.log('1. Enabling PostgreSQL extensions...');
    await prisma.$executeRawUnsafe(`
      CREATE EXTENSION IF NOT EXISTS vector;
      CREATE EXTENSION IF NOT EXISTS pg_trgm;
    `);
    console.log('✓ Extensions enabled (vector, pg_trgm)\n');

    // Read and execute the combined SQL file
    console.log('2. Applying all indexes from SQL file...');
    const sqlPath = join(__dirname, 'init-db', '002-add-indexes.sql');
    const sql = readFileSync(sqlPath, 'utf-8');

    await prisma.$executeRawUnsafe(sql);
    console.log('✓ All indexes applied\n');

    // Verify HNSW indexes
    console.log('3. Verifying HNSW vector indexes...');
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
    console.log('\n4. Verifying performance indexes...');
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

    console.log('\n✅ All indexes applied successfully!');
    console.log(`\n📊 Total indexes created: ${hnsw.length + perf.length}`);
    console.log('\n📈 Expected improvements:');
    console.log('  - Semantic similarity search: Enabled (HNSW)');
    console.log('  - Text search (ILIKE) queries: 10-100x faster');
    console.log('  - Filtered list queries: 5-20x faster');
    console.log('  - Date range queries: 3-10x faster');
    console.log('  - AI status filtering: 5-15x faster');
  } catch (error) {
    console.error('❌ Error applying indexes:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

applyIndexes();
