-- ============================================================================
-- Database Initialization: Performance Indexes
-- ============================================================================
-- This script adds performance indexes after tables are created by Prisma
-- Note: This runs on first container start. For existing databases, 
--       run manually or use the apply-vector-indexes.ts script
-- ============================================================================

-- Wait for tables to exist (they should be created by Prisma migrations)
-- This script will be re-run if tables don't exist yet

DO $$
BEGIN
    -- Check if whatsapp_message table exists
    IF EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'whatsapp_message'
    ) THEN
        
        RAISE NOTICE 'Adding HNSW index for whatsapp_message.embedding...';
        
        -- Add HNSW index for WhatsAppMessage.embedding
        -- Using cosine distance operator for semantic similarity
        CREATE INDEX IF NOT EXISTS whatsapp_message_embedding_hnsw_idx 
        ON whatsapp_message 
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64);
        
        RAISE NOTICE 'HNSW index created for whatsapp_message';
        
    ELSE
        RAISE NOTICE 'Table whatsapp_message does not exist yet. Skipping index creation.';
        RAISE NOTICE 'Run this script manually after Prisma migrations complete.';
    END IF;

    -- Check if message_embedding table exists
    IF EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'message_embedding'
    ) THEN
        
        RAISE NOTICE 'Adding HNSW index for message_embedding.embedding...';
        
        -- Add HNSW index for MessageEmbedding.embedding
        CREATE INDEX IF NOT EXISTS message_embedding_embedding_hnsw_idx 
        ON message_embedding 
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64);
        
        RAISE NOTICE 'HNSW index created for message_embedding';
        
    ELSE
        RAISE NOTICE 'Table message_embedding does not exist yet. Skipping index creation.';
        RAISE NOTICE 'Run this script manually after Prisma migrations complete.';
    END IF;

END $$;

-- ============================================================================
-- Verify Indexes
-- ============================================================================

DO $$
DECLARE
    index_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO index_count
    FROM pg_indexes
    WHERE tablename IN ('whatsapp_message', 'message_embedding')
        AND indexname LIKE '%hnsw%';
    
    RAISE NOTICE 'HNSW indexes created: %', index_count;
END $$;
