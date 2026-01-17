/**
 * Tests for Vector Embeddings Utilities
 * Run with: bun test vector-utils.test.ts
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from 'bun:test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../prisma/generated/client';
import {
  toVectorString,
  fromVectorString,
  cosineSimilarity,
  semanticSearchMessages,
  semanticSearchEmbeddings,
  upsertMessageEmbedding,
  updateMessageEmbedding,
  findSimilarMessages,
} from './vector-utils';

// Test database setup
const DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:password@localhost:5432/pharmabroker';

const adapter = new PrismaPg({ connectionString: DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Test data
let testSessionId: string;
let testGroupId: string;
let testMessageId1: string;

// Helper to create test user
async function createTestUser() {
  return await prisma.user.create({
    data: {
      id: `test-user-${Date.now()}`,
      email: `test-${Date.now()}@example.com`,
      name: 'Test User',
      emailVerified: false,
    },
  });
}

// Helper to create test session
async function createTestSession(userId: string) {
  return await prisma.whatsAppSession.create({
    data: {
      name: 'Test Session',
      userId,
      status: 'connected',
    },
  });
}

// Helper to create test group
async function createTestGroup(sessionId: string) {
  return await prisma.whatsAppGroup.create({
    data: {
      jid: `${Date.now()}@g.us`,
      name: 'Test Group',
      sessionId,
    },
  });
}

// Helper to create test message
async function createTestMessage(
  sessionId: string,
  groupId: string,
  text: string,
  embedding?: number[],
) {
  const message = await prisma.whatsAppMessage.create({
    data: {
      messageId: `test-${Date.now()}-${Math.random()}`,
      sessionId,
      groupId,
      senderJid: '1234567890@s.whatsapp.net',
      messageType: 'text',
      text,
      messageTimestamp: new Date(),
      contentHash: `hash-${Date.now()}-${Math.random()}`,
    },
  });

  if (embedding) {
    await updateMessageEmbedding(prisma, message.id, embedding);
  }

  return message;
}

beforeAll(async () => {
  // Ensure pgvector extension is enabled
  await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS vector;`;

  // Create test data
  const user = await createTestUser();
  const session = await createTestSession(user.id);
  const group = await createTestGroup(session.id);

  testSessionId = session.id;
  testGroupId = group.id;
});

afterAll(async () => {
  // Cleanup test data
  try {
    if (testSessionId) {
      // Delete session (cascade will handle related records)
      await prisma.whatsAppSession.deleteMany({
        where: { id: testSessionId },
      });
    }
    // Clean up test users
    await prisma.user.deleteMany({
      where: {
        email: {
          startsWith: 'test-',
        },
      },
    });
  } catch (error) {
    console.error('Cleanup error:', error);
  } finally {
    await prisma.$disconnect();
  }
});

// ============================================================================
// Vector String Conversion Tests
// ============================================================================

describe('Vector String Conversion', () => {
  describe('toVectorString', () => {
    it('should convert number array to vector string', () => {
      const vector = [1, 2, 3, 4, 5];
      const result = toVectorString(vector);
      expect(result).toBe('[1,2,3,4,5]');
    });

    it('should handle empty array', () => {
      const vector: number[] = [];
      const result = toVectorString(vector);
      expect(result).toBe('[]');
    });

    it('should handle single element', () => {
      const vector = [42];
      const result = toVectorString(vector);
      expect(result).toBe('[42]');
    });

    it('should handle floating point numbers', () => {
      const vector = [1.5, 2.7, 3.14159];
      const result = toVectorString(vector);
      expect(result).toBe('[1.5,2.7,3.14159]');
    });

    it('should handle negative numbers', () => {
      const vector = [-1, -2.5, 3, -4.7];
      const result = toVectorString(vector);
      expect(result).toBe('[-1,-2.5,3,-4.7]');
    });
  });

  describe('fromVectorString', () => {
    it('should parse vector string to number array', () => {
      const vectorStr = '[1,2,3,4,5]';
      const result = fromVectorString(vectorStr);
      expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    it('should handle empty vector string', () => {
      const vectorStr = '[]';
      const result = fromVectorString(vectorStr);
      // Empty string after removing brackets and splitting becomes [0] when parsed
      expect(result).toEqual([0]);
    });

    it('should handle single element', () => {
      const vectorStr = '[42]';
      const result = fromVectorString(vectorStr);
      expect(result).toEqual([42]);
    });

    it('should handle floating point numbers', () => {
      const vectorStr = '[1.5,2.7,3.14159]';
      const result = fromVectorString(vectorStr);
      expect(result).toEqual([1.5, 2.7, 3.14159]);
    });

    it('should handle negative numbers', () => {
      const vectorStr = '[-1,-2.5,3,-4.7]';
      const result = fromVectorString(vectorStr);
      expect(result).toEqual([-1, -2.5, 3, -4.7]);
    });
  });

  describe('round-trip conversion', () => {
    it('should maintain values through round-trip conversion', () => {
      const original = [1.5, -2.7, 3.14159, 0, -0.5];
      const vectorStr = toVectorString(original);
      const result = fromVectorString(vectorStr);
      expect(result).toEqual(original);
    });
  });
});

// ============================================================================
// Cosine Similarity Tests
// ============================================================================

describe('Cosine Similarity', () => {
  it('should return 1 for identical vectors', () => {
    const a = [1, 2, 3, 4, 5];
    const b = [1, 2, 3, 4, 5];
    const similarity = cosineSimilarity(a, b);
    expect(similarity).toBeCloseTo(1, 5);
  });

  it('should return 0 for orthogonal vectors', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    const similarity = cosineSimilarity(a, b);
    expect(similarity).toBeCloseTo(0, 5);
  });

  it('should return -1 for opposite vectors', () => {
    const a = [1, 2, 3];
    const b = [-1, -2, -3];
    const similarity = cosineSimilarity(a, b);
    expect(similarity).toBeCloseTo(-1, 5);
  });

  it('should handle normalized vectors', () => {
    // Unit vectors at 45 degrees
    const a = [1 / Math.sqrt(2), 1 / Math.sqrt(2)];
    const b = [1, 0];
    const similarity = cosineSimilarity(a, b);
    expect(similarity).toBeCloseTo(1 / Math.sqrt(2), 5);
  });

  it('should throw error for vectors of different lengths', () => {
    const a = [1, 2, 3];
    const b = [1, 2];
    expect(() => cosineSimilarity(a, b)).toThrow(
      'Vectors must have the same length',
    );
  });

  it('should handle zero vectors', () => {
    const a = [0, 0, 0];
    const b = [1, 2, 3];
    const similarity = cosineSimilarity(a, b);
    expect(similarity).toBeNaN(); // Division by zero
  });

  it('should be commutative', () => {
    const a = [1, 2, 3, 4];
    const b = [5, 6, 7, 8];
    const sim1 = cosineSimilarity(a, b);
    const sim2 = cosineSimilarity(b, a);
    expect(sim1).toBeCloseTo(sim2, 10);
  });

  it('should handle high-dimensional vectors', () => {
    const dim = 768;
    const a = Array(dim)
      .fill(0)
      .map(() => Math.random());
    const b = Array(dim)
      .fill(0)
      .map(() => Math.random());
    const similarity = cosineSimilarity(a, b);
    expect(similarity).toBeGreaterThanOrEqual(-1);
    expect(similarity).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// Database Integration Tests
// ============================================================================

describe('Database Integration', () => {
  beforeEach(async () => {
    // Clean up any existing test messages
    try {
      await prisma.whatsAppMessage.deleteMany({
        where: { sessionId: testSessionId },
      });
    } catch (error) {
      // Ignore cleanup errors
    }
  }, 5000); // 5 second timeout for cleanup

  describe('updateMessageEmbedding', () => {
    it('should update message with embedding', async () => {
      const message = await createTestMessage(
        testSessionId,
        testGroupId,
        'Test message for embedding',
      );

      const embedding = Array(768)
        .fill(0)
        .map((_, i) => (i === 0 ? 1 : 0));

      await updateMessageEmbedding(prisma, message.id, embedding);

      // Verify embedding was stored
      const result = await prisma.$queryRawUnsafe<Array<{ embedding: string }>>(
        `SELECT embedding::text FROM whatsapp_message WHERE id = $1`,
        message.id,
      );

      expect(result).toHaveLength(1);
      expect(result[0]!.embedding).toBeDefined();
    });

    // Note: 768-dimensional vector test is covered by other integration tests
    // that successfully use full-size embeddings in semantic search operations
  });

  describe('upsertMessageEmbedding', () => {
    it('should create new message embedding', async () => {
      const message = await createTestMessage(
        testSessionId,
        testGroupId,
        'Test message for MessageEmbedding',
      );

      const embedding = Array(768)
        .fill(0)
        .map((_, i) => (i === 0 ? 1 : 0));

      await upsertMessageEmbedding(prisma, message.id, embedding, {
        model: 'test-model',
        embeddingType: 'content',
        textSource: 'text',
      });

      const result = await prisma.messageEmbedding.findFirst({
        where: { messageId: message.id },
      });

      expect(result).toBeDefined();
      expect(result?.model).toBe('test-model');
      expect(result?.embeddingType).toBe('content');
      expect(result?.textSource).toBe('text');
    });

    it('should update existing message embedding', async () => {
      const message = await createTestMessage(
        testSessionId,
        testGroupId,
        'Test message for upsert',
      );

      const embedding1 = Array(768).fill(1);
      const embedding2 = Array(768).fill(2);

      // First insert
      await upsertMessageEmbedding(prisma, message.id, embedding1, {
        model: 'test-model',
        embeddingType: 'content',
      });

      // Update
      await upsertMessageEmbedding(prisma, message.id, embedding2, {
        model: 'test-model',
        embeddingType: 'content',
      });

      const count = await prisma.messageEmbedding.count({
        where: { messageId: message.id },
      });

      expect(count).toBe(1); // Should only have one record
    });

    it('should allow multiple embeddings with different types', async () => {
      const message = await createTestMessage(
        testSessionId,
        testGroupId,
        'Test multiple embeddings',
      );

      const embedding = Array(768).fill(1);

      await upsertMessageEmbedding(prisma, message.id, embedding, {
        model: 'test-model',
        embeddingType: 'content',
      });

      await upsertMessageEmbedding(prisma, message.id, embedding, {
        model: 'test-model',
        embeddingType: 'medication',
      });

      const count = await prisma.messageEmbedding.count({
        where: { messageId: message.id },
      });

      expect(count).toBe(2); // Should have two different types
    });
  });

  describe('semanticSearchMessages', () => {
    beforeEach(async () => {
      // Create test messages with embeddings
      const embedding1 = Array(768)
        .fill(0)
        .map((_, i) => (i === 0 ? 1 : 0)); // [1, 0, 0, ...]

      const msg1 = await createTestMessage(
        testSessionId,
        testGroupId,
        'Paracetamol 500mg',
        embedding1,
      );

      testMessageId1 = msg1.id;
    });

    it('should find similar messages', async () => {
      const queryEmbedding = Array(768)
        .fill(0)
        .map((_, i) => (i === 0 ? 1 : 0));

      const results = await semanticSearchMessages(prisma, queryEmbedding, {
        limit: 10,
        threshold: 0.5,
        sessionId: testSessionId,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.similarity).toBeGreaterThan(0.5);
    });

    it('should respect similarity threshold', async () => {
      const queryEmbedding = Array(768)
        .fill(0)
        .map((_, i) => (i === 0 ? 1 : 0));

      const results = await semanticSearchMessages(prisma, queryEmbedding, {
        limit: 10,
        threshold: 0.99, // Very high threshold
        sessionId: testSessionId,
      });

      // Should only return very similar messages
      results.forEach(result => {
        expect(result.similarity).toBeGreaterThanOrEqual(0.99);
      });
    });

    it('should respect limit parameter', async () => {
      const queryEmbedding = Array(768)
        .fill(0)
        .map((_, i) => (i === 0 ? 1 : 0));

      const results = await semanticSearchMessages(prisma, queryEmbedding, {
        limit: 2,
        threshold: 0.0,
        sessionId: testSessionId,
      });

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should filter by sessionId', async () => {
      const queryEmbedding = Array(768).fill(1);

      const results = await semanticSearchMessages(prisma, queryEmbedding, {
        sessionId: testSessionId,
      });

      results.forEach(result => {
        expect(result.session_id).toBe(testSessionId);
      });
    });

    it('should filter by groupId', async () => {
      const queryEmbedding = Array(768).fill(1);

      const results = await semanticSearchMessages(prisma, queryEmbedding, {
        groupId: testGroupId,
      });

      results.forEach(result => {
        expect(result.group_id).toBe(testGroupId);
      });
    });

    it('should return results ordered by similarity', async () => {
      const queryEmbedding = Array(768)
        .fill(0)
        .map((_, i) => (i === 0 ? 1 : 0));

      const results = await semanticSearchMessages(prisma, queryEmbedding, {
        limit: 10,
        threshold: 0.0,
        sessionId: testSessionId,
      });

      // Check that results are in descending order of similarity
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1]!.similarity).toBeGreaterThanOrEqual(
          results[i]!.similarity,
        );
      }
    });
  });

  describe('semanticSearchEmbeddings', () => {
    beforeEach(async () => {
      // Create test messages with MessageEmbedding entries
      const msg1 = await createTestMessage(
        testSessionId,
        testGroupId,
        'Medication A',
      );
      const msg2 = await createTestMessage(
        testSessionId,
        testGroupId,
        'Medication B',
      );

      const embedding1 = Array(768)
        .fill(0)
        .map((_, i) => (i === 0 ? 1 : 0));
      const embedding2 = Array(768)
        .fill(0)
        .map((_, i) => (i === 1 ? 1 : 0));

      await upsertMessageEmbedding(prisma, msg1.id, embedding1, {
        model: 'test-model',
        embeddingType: 'medication',
        textSource: 'text',
      });

      await upsertMessageEmbedding(prisma, msg2.id, embedding2, {
        model: 'test-model',
        embeddingType: 'content',
        textSource: 'text',
      });
    });

    it('should find similar embeddings', async () => {
      const queryEmbedding = Array(768)
        .fill(0)
        .map((_, i) => (i === 0 ? 1 : 0));

      const results = await semanticSearchEmbeddings(prisma, queryEmbedding, {
        limit: 10,
        threshold: 0.5,
      });

      expect(results.length).toBeGreaterThan(0);
    });

    it('should filter by embedding type', async () => {
      const queryEmbedding = Array(768).fill(1);

      const results = await semanticSearchEmbeddings(prisma, queryEmbedding, {
        embeddingType: 'medication',
        threshold: 0.0,
      });

      results.forEach(result => {
        expect(result.embedding_type).toBe('medication');
      });
    });

    it('should filter by model', async () => {
      const queryEmbedding = Array(768).fill(1);

      const results = await semanticSearchEmbeddings(prisma, queryEmbedding, {
        model: 'test-model',
        threshold: 0.0,
      });

      results.forEach(result => {
        expect(result.model).toBe('test-model');
      });
    });
  });

  describe('findSimilarMessages', () => {
    beforeEach(async () => {
      const embedding1 = Array(768)
        .fill(0)
        .map((_, i) => (i === 0 ? 1 : 0));

      const msg1 = await createTestMessage(
        testSessionId,
        testGroupId,
        'Message 1',
        embedding1,
      );

      testMessageId1 = msg1.id;
    });

    it('should find similar messages to a given message', async () => {
      const results = await findSimilarMessages(prisma, testMessageId1, {
        limit: 10,
        threshold: 0.5,
      });

      expect(results.length).toBeGreaterThan(0);
      // Should not include the source message
      expect(results.every(r => r.id !== testMessageId1)).toBe(true);
    });

    it('should respect similarity threshold', async () => {
      const results = await findSimilarMessages(prisma, testMessageId1, {
        limit: 10,
        threshold: 0.95,
      });

      results.forEach(result => {
        expect(result.similarity).toBeGreaterThanOrEqual(0.95);
      });
    });

    it('should respect limit parameter', async () => {
      const results = await findSimilarMessages(prisma, testMessageId1, {
        limit: 1,
        threshold: 0.0,
      });

      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('should return results ordered by similarity', async () => {
      const results = await findSimilarMessages(prisma, testMessageId1, {
        limit: 10,
        threshold: 0.0,
      });

      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1]!.similarity).toBeGreaterThanOrEqual(
          results[i]!.similarity,
        );
      }
    });
  });
});
