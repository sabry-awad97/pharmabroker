/**
 * Vector Embeddings Utilities
 * Helper functions for working with pgvector embeddings
 */

import type { PrismaClient } from '../prisma/generated/client';

/**
 * Convert a number array to pgvector format string
 */
export function toVectorString(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

/**
 * Parse a pgvector string to number array
 */
export function fromVectorString(vectorStr: string): number[] {
  return vectorStr
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map(Number);
}

/**
 * Calculate cosine similarity between two vectors
 * Returns a value between -1 and 1 (1 = identical, 0 = orthogonal, -1 = opposite)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Semantic search for messages using cosine similarity
 * @param prisma - Prisma client instance
 * @param queryEmbedding - The embedding vector to search for
 * @param options - Search options
 * @returns Array of messages with similarity scores
 */
export async function semanticSearchMessages(
  prisma: PrismaClient,
  queryEmbedding: number[],
  options: {
    limit?: number;
    threshold?: number;
    sessionId?: string;
    groupId?: string;
  } = {},
) {
  const { limit = 10, threshold = 0.7, sessionId, groupId } = options;

  const vectorStr = toVectorString(queryEmbedding);

  // Build WHERE clause
  const whereConditions: string[] = ['embedding IS NOT NULL'];
  if (sessionId) whereConditions.push(`session_id = '${sessionId}'`);
  if (groupId) whereConditions.push(`group_id = '${groupId}'`);

  const whereClause =
    whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  // Use cosine distance operator (<=>)
  // Lower distance = higher similarity
  const query = `
    SELECT 
      id,
      message_id,
      session_id,
      group_id,
      sender_jid,
      text,
      message_timestamp,
      1 - (embedding <=> '${vectorStr}'::vector) as similarity
    FROM whatsapp_message
    ${whereClause}
    ORDER BY embedding <=> '${vectorStr}'::vector
    LIMIT ${limit};
  `;

  const results = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      message_id: string;
      session_id: string;
      group_id: string;
      sender_jid: string;
      text: string | null;
      message_timestamp: Date;
      similarity: number;
    }>
  >(query);

  // Filter by threshold
  return results.filter(r => r.similarity >= threshold);
}

/**
 * Semantic search using MessageEmbedding table
 * @param prisma - Prisma client instance
 * @param queryEmbedding - The embedding vector to search for
 * @param options - Search options
 * @returns Array of message embeddings with similarity scores
 */
export async function semanticSearchEmbeddings(
  prisma: PrismaClient,
  queryEmbedding: number[],
  options: {
    limit?: number;
    threshold?: number;
    embeddingType?: string;
    model?: string;
  } = {},
) {
  const { limit = 10, threshold = 0.7, embeddingType, model } = options;

  const vectorStr = toVectorString(queryEmbedding);

  // Build WHERE clause
  const whereConditions: string[] = [];
  if (embeddingType)
    whereConditions.push(`embedding_type = '${embeddingType}'`);
  if (model) whereConditions.push(`model = '${model}'`);

  const whereClause =
    whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  const query = `
    SELECT 
      me.id,
      me.message_id,
      me.model,
      me.embedding_type,
      me.text_source,
      wm.text,
      wm.message_timestamp,
      1 - (me.embedding <=> '${vectorStr}'::vector) as similarity
    FROM message_embedding me
    JOIN whatsapp_message wm ON me.message_id = wm.id
    ${whereClause}
    ORDER BY me.embedding <=> '${vectorStr}'::vector
    LIMIT ${limit};
  `;

  const results = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      message_id: string;
      model: string;
      embedding_type: string;
      text_source: string | null;
      text: string | null;
      message_timestamp: Date;
      similarity: number;
    }>
  >(query);

  return results.filter(r => r.similarity >= threshold);
}

/**
 * Create or update message embedding
 * @param prisma - Prisma client instance
 * @param messageId - Message ID
 * @param embedding - Embedding vector
 * @param metadata - Embedding metadata
 */
export async function upsertMessageEmbedding(
  prisma: PrismaClient,
  messageId: string,
  embedding: number[],
  metadata: {
    model: string;
    embeddingType?: string;
    textSource?: string;
  },
) {
  const vectorStr = toVectorString(embedding);
  const { model, embeddingType = 'content', textSource } = metadata;

  // Use raw SQL for vector insertion
  await prisma.$executeRawUnsafe(
    `
    INSERT INTO message_embedding (id, message_id, embedding, model, embedding_type, text_source, created_at, updated_at)
    VALUES (gen_random_uuid(), $1, $2::vector(768), $3, $4, $5, NOW(), NOW())
    ON CONFLICT (message_id, embedding_type, model)
    DO UPDATE SET 
      embedding = EXCLUDED.embedding,
      text_source = EXCLUDED.text_source,
      updated_at = NOW();
  `,
    messageId,
    vectorStr,
    model,
    embeddingType,
    textSource,
  );
}

/**
 * Update message embedding directly on WhatsAppMessage
 * @param prisma - Prisma client instance
 * @param messageId - Message ID
 * @param embedding - Embedding vector
 */
export async function updateMessageEmbedding(
  prisma: PrismaClient,
  messageId: string,
  embedding: number[],
) {
  const vectorStr = toVectorString(embedding);

  await prisma.$executeRawUnsafe(
    `
    UPDATE whatsapp_message
    SET embedding = $1::vector(768)
    WHERE id = $2;
  `,
    vectorStr,
    messageId,
  );
}

/**
 * Find similar messages to a given message
 * @param prisma - Prisma client instance
 * @param messageId - Source message ID
 * @param options - Search options
 */
export async function findSimilarMessages(
  prisma: PrismaClient,
  messageId: string,
  options: {
    limit?: number;
    threshold?: number;
  } = {},
) {
  const { limit = 10, threshold = 0.7 } = options;

  const query = `
    WITH source_message AS (
      SELECT embedding FROM whatsapp_message WHERE id = $1
    )
    SELECT 
      wm.id,
      wm.message_id,
      wm.session_id,
      wm.group_id,
      wm.sender_jid,
      wm.text,
      wm.message_timestamp,
      1 - (wm.embedding <=> sm.embedding) as similarity
    FROM whatsapp_message wm, source_message sm
    WHERE wm.id != $1 AND wm.embedding IS NOT NULL
    ORDER BY wm.embedding <=> sm.embedding
    LIMIT $2;
  `;

  const results = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      message_id: string;
      session_id: string;
      group_id: string;
      sender_jid: string;
      text: string | null;
      message_timestamp: Date;
      similarity: number;
    }>
  >(query, messageId, limit);

  return results.filter(r => r.similarity >= threshold);
}
