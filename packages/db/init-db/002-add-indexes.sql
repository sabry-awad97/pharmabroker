-- ============================================================================
-- Database Initialization: All Performance Indexes
-- ============================================================================
-- This script adds all performance indexes after tables are created by Prisma
-- Includes:
--   1. HNSW vector indexes for semantic similarity search
--   2. Trigram (pg_trgm) indexes for fast text search
--   3. Composite indexes for common query patterns
--
-- Note: This runs on first container start. For existing databases, 
--       run manually or use the apply-indexes.ts script
-- ============================================================================

-- Wait for tables to exist (they should be created by Prisma migrations)
-- This script will be re-run if tables don't exist yet

DO $$
BEGIN
    -- ========================================================================
    -- PART 1: HNSW Vector Indexes for Semantic Search
    -- ========================================================================
    
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
        RAISE NOTICE 'Table whatsapp_message does not exist yet. Skipping HNSW index creation.';
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
        RAISE NOTICE 'Table message_embedding does not exist yet. Skipping HNSW index creation.';
    END IF;

    -- ========================================================================
    -- PART 2: Text Search and Query Performance Indexes
    -- ========================================================================
    
    -- Check if whatsapp_message table exists for performance indexes
    IF EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'whatsapp_message'
    ) THEN
        
        RAISE NOTICE 'Adding performance indexes for whatsapp_message...';
        
        -- Trigram indexes for text search (case-insensitive ILIKE queries)
        CREATE INDEX IF NOT EXISTS whatsapp_message_text_trgm_idx 
        ON whatsapp_message 
        USING gin (text gin_trgm_ops);
        
        CREATE INDEX IF NOT EXISTS whatsapp_message_caption_trgm_idx 
        ON whatsapp_message 
        USING gin (caption gin_trgm_ops);
        
        CREATE INDEX IF NOT EXISTS whatsapp_message_sender_push_name_trgm_idx 
        ON whatsapp_message 
        USING gin (sender_push_name gin_trgm_ops);
        
        -- Composite indexes for common filter combinations
        CREATE INDEX IF NOT EXISTS whatsapp_message_session_timestamp_idx 
        ON whatsapp_message (session_id, message_timestamp DESC);
        
        CREATE INDEX IF NOT EXISTS whatsapp_message_session_ai_status_idx 
        ON whatsapp_message (session_id, ai_status);
        
        CREATE INDEX IF NOT EXISTS whatsapp_message_session_type_idx 
        ON whatsapp_message (session_id, message_type);
        
        CREATE INDEX IF NOT EXISTS whatsapp_message_session_source_idx 
        ON whatsapp_message (session_id, source);
        
        CREATE INDEX IF NOT EXISTS whatsapp_message_group_timestamp_idx 
        ON whatsapp_message (group_id, message_timestamp DESC);
        
        -- Index for date range queries
        CREATE INDEX IF NOT EXISTS whatsapp_message_timestamp_idx 
        ON whatsapp_message (message_timestamp DESC);
        
        -- Index for AI processing queries
        CREATE INDEX IF NOT EXISTS whatsapp_message_ai_status_timestamp_idx 
        ON whatsapp_message (ai_status, message_timestamp DESC);
        
        RAISE NOTICE 'Performance indexes created for whatsapp_message';
        
    END IF;

    -- Check if whatsapp_group table exists
    IF EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'whatsapp_group'
    ) THEN
        
        RAISE NOTICE 'Adding performance indexes for whatsapp_group...';
        
        -- Index for group name search
        CREATE INDEX IF NOT EXISTS whatsapp_group_name_trgm_idx 
        ON whatsapp_group 
        USING gin (name gin_trgm_ops);
        
        -- Composite index for session + name queries
        CREATE INDEX IF NOT EXISTS whatsapp_group_session_name_idx 
        ON whatsapp_group (session_id, name);
        
        RAISE NOTICE 'Performance indexes created for whatsapp_group';
        
    END IF;

    -- Check if whatsapp_group_participant table exists
    IF EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'whatsapp_group_participant'
    ) THEN
        
        RAISE NOTICE 'Adding performance indexes for whatsapp_group_participant...';
        
        -- Index for participant search
        CREATE INDEX IF NOT EXISTS whatsapp_group_participant_display_name_trgm_idx 
        ON whatsapp_group_participant 
        USING gin (display_name gin_trgm_ops);
        
        -- Composite index for group + role queries
        CREATE INDEX IF NOT EXISTS whatsapp_group_participant_group_role_idx 
        ON whatsapp_group_participant (group_id, role);
        
        RAISE NOTICE 'Performance indexes created for whatsapp_group_participant';
        
    END IF;

END $$;

-- ============================================================================
-- Verify All Indexes
-- ============================================================================

DO $$
DECLARE
    hnsw_count INTEGER;
    perf_count INTEGER;
    total_count INTEGER;
BEGIN
    -- Count HNSW indexes
    SELECT COUNT(*) INTO hnsw_count
    FROM pg_indexes
    WHERE tablename IN ('whatsapp_message', 'message_embedding')
        AND indexname LIKE '%hnsw%';
    
    -- Count performance indexes
    SELECT COUNT(*) INTO perf_count
    FROM pg_indexes
    WHERE tablename IN ('whatsapp_message', 'whatsapp_group', 'whatsapp_group_participant')
        AND (indexname LIKE '%trgm%' OR indexname LIKE '%timestamp%' OR indexname LIKE '%ai_status%');
    
    total_count := hnsw_count + perf_count;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Index Creation Summary:';
    RAISE NOTICE '  HNSW vector indexes: %', hnsw_count;
    RAISE NOTICE '  Performance indexes: %', perf_count;
    RAISE NOTICE '  Total indexes: %', total_count;
    RAISE NOTICE '========================================';
END $$;
