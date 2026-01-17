#!/usr/bin/env bun
/**
 * Query Analysis Tool
 * Analyzes common queries using EXPLAIN ANALYZE to verify index usage
 *
 * Usage:
 *   bun run analyze-queries.ts
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './prisma/generated/client';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:password@localhost:5432/pharmabroker';
const adapter = new PrismaPg({ connectionString: DATABASE_URL });
const prisma = new PrismaClient({ adapter });

interface QueryPlan {
  'QUERY PLAN': string;
}

async function analyzeQuery(name: string, query: string) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 ${name}`);
  console.log(`${'='.repeat(80)}\n`);

  console.log('Query:');
  console.log(query.trim());
  console.log('\n');

  try {
    const plan = await prisma.$queryRawUnsafe<QueryPlan[]>(
      `EXPLAIN ANALYZE ${query}`,
    );

    console.log('Execution Plan:');
    console.log('-'.repeat(80));
    plan.forEach(row => {
      console.log(row['QUERY PLAN']);
    });

    // Check for index usage
    const planText = plan.map(p => p['QUERY PLAN']).join('\n');
    const usesIndex =
      planText.includes('Index Scan') || planText.includes('Index Only Scan');
    const usesSeqScan = planText.includes('Seq Scan');
    const usesHNSW = planText.includes('hnsw');

    console.log('\n' + '-'.repeat(80));
    console.log('Analysis:');
    if (usesHNSW) {
      console.log('✅ Uses HNSW index for vector search');
    }
    if (usesIndex && !usesHNSW) {
      console.log('✅ Uses B-tree index');
    }
    if (usesSeqScan) {
      console.log('⚠️  Uses sequential scan (may need optimization)');
    }
    if (!usesIndex && !usesSeqScan) {
      console.log('ℹ️  Query plan unclear - check execution plan above');
    }
  } catch (error: any) {
    console.log(`❌ Error: ${error.message}`);
  }
}

async function analyzeQueries() {
  console.log('🔍 Database Query Analysis\n');
  console.log('This tool analyzes common queries to verify index usage.\n');

  try {
    // Check if we have data to analyze
    const messageCount = await prisma.whatsAppMessage.count();
    console.log(`📈 Database contains ${messageCount} messages\n`);

    if (messageCount === 0) {
      console.log(
        '⚠️  No messages found. Add some test data first for meaningful analysis.',
      );
      console.log(
        '   The analysis will still show query plans, but without actual execution stats.\n',
      );
    }

    // Get a sample session and group ID
    const sampleMessage = await prisma.whatsAppMessage.findFirst({
      select: { sessionId: true, groupId: true },
    });

    const sessionId = sampleMessage?.sessionId || 'sample-session-id';
    const groupId = sampleMessage?.groupId || 'sample-group-id';

    // Query 1: Time-based query with sessionId
    await analyzeQuery(
      'Query 1: Messages by Session and Time Range',
      `
      SELECT id, message_id, text, message_timestamp
      FROM whatsapp_message
      WHERE session_id = '${sessionId}'
        AND message_timestamp >= NOW() - INTERVAL '7 days'
      ORDER BY message_timestamp DESC
      LIMIT 50;
      `,
    );

    // Query 2: Time-based query with groupId
    await analyzeQuery(
      'Query 2: Messages by Group and Time Range',
      `
      SELECT id, message_id, text, message_timestamp
      FROM whatsapp_message
      WHERE group_id = '${groupId}'
        AND message_timestamp >= NOW() - INTERVAL '1 day'
      ORDER BY message_timestamp DESC
      LIMIT 20;
      `,
    );

    // Query 3: Vector similarity search (if embeddings exist)
    const hasEmbeddings = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM whatsapp_message
      WHERE embedding IS NOT NULL;
    `;

    const embeddingCount = Number(hasEmbeddings[0]?.count || 0);
    console.log(`\n📊 Messages with embeddings: ${embeddingCount}`);

    if (embeddingCount > 0) {
      // Get a sample embedding
      const sampleEmbedding = await prisma.$queryRaw<
        Array<{ embedding: string }>
      >`
        SELECT embedding::text as embedding
        FROM whatsapp_message
        WHERE embedding IS NOT NULL
        LIMIT 1;
      `;

      if (sampleEmbedding.length > 0) {
        const vectorStr = sampleEmbedding[0]!.embedding;

        await analyzeQuery(
          'Query 3: Vector Similarity Search (Semantic Search)',
          `
          SELECT id, text, 
                 1 - (embedding <=> '${vectorStr}'::vector) as similarity
          FROM whatsapp_message
          WHERE embedding IS NOT NULL
          ORDER BY embedding <=> '${vectorStr}'::vector
          LIMIT 10;
          `,
        );
      }
    } else {
      console.log(
        '\n⚠️  No embeddings found. Skipping vector similarity query.',
      );
      console.log(
        '   Generate embeddings first to test HNSW index performance.',
      );
    }

    // Query 4: AI status filtering
    await analyzeQuery(
      'Query 4: Messages by AI Processing Status',
      `
      SELECT id, message_id, text, ai_status
      FROM whatsapp_message
      WHERE ai_status = 'pending'
        AND message_type = 'text'
      ORDER BY message_timestamp DESC
      LIMIT 100;
      `,
    );

    // Query 5: Content hash lookup (deduplication)
    await analyzeQuery(
      'Query 5: Content Hash Lookup (Deduplication)',
      `
      SELECT id, message_id, text, content_hash
      FROM whatsapp_message
      WHERE session_id = '${sessionId}'
        AND content_hash = 'sample-hash-value'
      LIMIT 1;
      `,
    );

    // Summary
    console.log(`\n${'='.repeat(80)}`);
    console.log('📋 Summary');
    console.log(`${'='.repeat(80)}\n`);

    const allIndexes = await prisma.$queryRaw<
      Array<{
        tablename: string;
        indexname: string;
        indexdef: string;
      }>
    >`
      SELECT tablename, indexname, indexdef
      FROM pg_indexes
      WHERE tablename IN ('whatsapp_message', 'message_embedding')
      ORDER BY tablename, indexname;
    `;

    console.log('Available Indexes:');
    allIndexes.forEach(idx => {
      const type = idx.indexdef.includes('hnsw')
        ? '[HNSW]'
        : idx.indexdef.includes('UNIQUE')
          ? '[UNIQUE]'
          : '[BTREE]';
      console.log(`  ${type} ${idx.indexname}`);
    });

    console.log('\n💡 Recommendations:');
    console.log(
      '  1. Composite indexes (sessionId, timestamp) and (groupId, timestamp) optimize time-range queries',
    );
    console.log(
      '  2. HNSW indexes enable fast approximate nearest neighbor search for embeddings',
    );
    console.log('  3. Monitor query performance with real workload data');
    console.log(
      '  4. Consider adjusting HNSW ef_search parameter for accuracy vs speed trade-off',
    );
    console.log(
      '  5. Use EXPLAIN ANALYZE regularly to verify index usage as data grows',
    );

    console.log('\n📚 Resources:');
    console.log(
      '  - PostgreSQL EXPLAIN: https://www.postgresql.org/docs/current/sql-explain.html',
    );
    console.log(
      '  - pgvector Performance: https://github.com/pgvector/pgvector#performance',
    );
    console.log(
      '  - Index Tuning: https://www.postgresql.org/docs/current/indexes.html',
    );
  } catch (error) {
    console.error('\n❌ Analysis failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeQueries();
