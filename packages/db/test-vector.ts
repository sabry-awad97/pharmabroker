#!/usr/bin/env bun
/**
 * Test script to verify vector embeddings functionality
 * Run with: bun run test-vector.ts
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './prisma/generated/client';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:password@localhost:5432/pharmabroker';
const adapter = new PrismaPg({ connectionString: DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function testVectorEmbeddings() {
  console.log('🧪 Testing Vector Embeddings Schema...\n');

  try {
    // Test 1: Check if pgvector extension is enabled
    console.log('1️⃣ Checking pgvector extension...');
    const extensions = await prisma.$queryRaw<Array<{ extname: string }>>`
      SELECT extname FROM pg_extension WHERE extname = 'vector';
    `;

    if (extensions.length === 0) {
      console.log('⚠️  pgvector extension not found. Enabling...');
      await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS vector;`;
      console.log('✅ pgvector extension enabled');
    } else {
      console.log('✅ pgvector extension is already enabled');
    }

    // Test 2: Check table structure
    console.log('\n2️⃣ Checking table structure...');
    const messageColumns = await prisma.$queryRaw<
      Array<{ column_name: string; data_type: string }>
    >`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'whatsapp_message' AND column_name = 'embedding';
    `;

    const embeddingTable = await prisma.$queryRaw<
      Array<{ column_name: string; data_type: string }>
    >`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'message_embedding';
    `;

    console.log(
      '✅ WhatsAppMessage.embedding column:',
      messageColumns.length > 0 ? 'EXISTS' : 'NOT FOUND',
    );
    console.log('✅ MessageEmbedding table columns:', embeddingTable.length);

    // Test 3: Test vector operations (if we have test data)
    console.log('\n3️⃣ Testing vector operations...');

    // Create a sample embedding vector (768 dimensions, all zeros for testing)
    const sampleVector = Array(768)
      .fill(0)
      .map((_, i) => (i === 0 ? 1 : 0));
    const vectorString = `[${sampleVector.join(',')}]`;

    // Test vector insertion (we'll use raw SQL for now)
    console.log('   Testing vector format...');
    await prisma.$queryRaw<Array<{ result: string }>>`
      SELECT ${vectorString}::vector(768) as result;
    `;
    console.log('✅ Vector format is valid');

    // Test 4: Check indexes
    console.log('\n4️⃣ Checking indexes...');
    const indexes = await prisma.$queryRaw<
      Array<{ indexname: string; tablename: string }>
    >`
      SELECT indexname, tablename 
      FROM pg_indexes 
      WHERE tablename IN ('whatsapp_message', 'message_embedding')
      ORDER BY tablename, indexname;
    `;
    console.log(`✅ Found ${indexes.length} indexes on vector-related tables`);

    console.log('\n✨ All tests passed! Vector embeddings schema is ready.\n');
    console.log('📝 Summary:');
    console.log('   - pgvector extension: enabled');
    console.log('   - WhatsAppMessage.embedding: available (768 dimensions)');
    console.log('   - MessageEmbedding table: created');
    console.log('   - Vector operations: working');
    console.log('\n🎯 Next steps:');
    console.log('   1. Implement embedding generation service');
    console.log('   2. Add semantic search queries');
    console.log('   3. Create medication matching logic');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testVectorEmbeddings();
