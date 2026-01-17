#!/usr/bin/env bun
/**
 * Apply Vector Indexes Migration
 * Adds HNSW indexes for fast approximate nearest neighbor search
 *
 * Usage:
 *   bun run apply-indexes.ts
 *
 * This script is useful for:
 * - Applying indexes to existing databases
 * - Re-creating indexes after schema changes
 * - Manual index management
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './prisma/generated/client';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:password@localhost:5432/pharmabroker';
const adapter = new PrismaPg({ connectionString: DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function applyVectorIndexes() {
  console.log('🚀 Applying Vector Indexes...\n');

  try {
    // Check if tables exist
    console.log('🔍 Checking if tables exist...');

    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
        AND tablename IN ('whatsapp_message', 'message_embedding')
      ORDER BY tablename;
    `;

    if (tables.length === 0) {
      console.log('⚠️  No tables found. Please run Prisma migrations first:');
      console.log('   bun run db:push');
      process.exit(1);
    }

    console.log(
      `✅ Found ${tables.length} tables: ${tables.map(t => t.tablename).join(', ')}\n`,
    );

    // Apply HNSW index for whatsapp_message
    if (tables.some(t => t.tablename === 'whatsapp_message')) {
      console.log('⏳ Creating HNSW index for whatsapp_message.embedding...');

      try {
        await prisma.$executeRaw`
          CREATE INDEX IF NOT EXISTS whatsapp_message_embedding_hnsw_idx 
          ON whatsapp_message 
          USING hnsw (embedding vector_cosine_ops)
          WITH (m = 16, ef_construction = 64);
        `;
        console.log('✅ HNSW index created for whatsapp_message\n');
      } catch (error: any) {
        if (error.message?.includes('already exists')) {
          console.log('ℹ️  Index already exists for whatsapp_message\n');
        } else {
          throw error;
        }
      }
    }

    // Apply HNSW index for message_embedding
    if (tables.some(t => t.tablename === 'message_embedding')) {
      console.log('⏳ Creating HNSW index for message_embedding.embedding...');

      try {
        await prisma.$executeRaw`
          CREATE INDEX IF NOT EXISTS message_embedding_embedding_hnsw_idx 
          ON message_embedding 
          USING hnsw (embedding vector_cosine_ops)
          WITH (m = 16, ef_construction = 64);
        `;
        console.log('✅ HNSW index created for message_embedding\n');
      } catch (error: any) {
        if (error.message?.includes('already exists')) {
          console.log('ℹ️  Index already exists for message_embedding\n');
        } else {
          throw error;
        }
      }
    }

    // Verify indexes were created
    console.log('🔍 Verifying indexes...\n');

    const indexes = await prisma.$queryRaw<
      Array<{
        schemaname: string;
        tablename: string;
        indexname: string;
        indexdef: string;
      }>
    >`
      SELECT 
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE tablename IN ('whatsapp_message', 'message_embedding')
      ORDER BY tablename, indexname;
    `;

    console.log('📊 Current Indexes:\n');
    console.log(
      'Table                | Index Name                                    | Type',
    );
    console.log(
      '---------------------|-----------------------------------------------|--------',
    );

    indexes.forEach(idx => {
      const indexType = idx.indexdef.includes('hnsw')
        ? 'HNSW'
        : idx.indexdef.includes('ivfflat')
          ? 'IVFFlat'
          : idx.indexdef.includes('UNIQUE')
            ? 'UNIQUE'
            : 'BTREE';

      console.log(
        `${idx.tablename.padEnd(20)} | ${idx.indexname.padEnd(45)} | ${indexType}`,
      );
    });

    // Check for HNSW indexes specifically
    const hnswIndexes = indexes.filter(idx => idx.indexdef.includes('hnsw'));
    const compositeIndexes = indexes.filter(
      idx =>
        idx.indexname.includes('message_timestamp') ||
        idx.indexdef.includes('message_timestamp'),
    );

    console.log(`\n✨ Index application completed!`);
    console.log(`   - Total indexes: ${indexes.length}`);
    console.log(`   - HNSW indexes: ${hnswIndexes.length}`);
    console.log(`   - Composite indexes: ${compositeIndexes.length}`);

    if (hnswIndexes.length > 0) {
      console.log('\n🎯 HNSW Vector Indexes:');
      hnswIndexes.forEach(idx => {
        console.log(`   ✓ ${idx.indexname} on ${idx.tablename}`);
      });
    }

    if (compositeIndexes.length > 0) {
      console.log('\n📅 Composite Time-based Indexes:');
      compositeIndexes.forEach(idx => {
        console.log(`   ✓ ${idx.indexname} on ${idx.tablename}`);
      });
    }

    console.log('\n📈 Performance Benefits:');
    console.log('   - Semantic search: O(log n) vs O(n) sequential scan');
    console.log(
      '   - Time-based queries: Composite indexes on (sessionId, timestamp) and (groupId, timestamp)',
    );
    console.log('   - Optimized for > 10k messages with embeddings');

    console.log('\n💡 Next Steps:');
    console.log('   1. Run query analysis: bun run analyze-queries.ts');
    console.log('   2. Monitor query performance with real data');
    console.log('   3. Adjust HNSW parameters if needed (m, ef_construction)');
  } catch (error) {
    console.error('\n❌ Index application failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

applyVectorIndexes();
