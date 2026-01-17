-- ============================================================================
-- Database Initialization: Extensions
-- ============================================================================
-- This script runs automatically when the PostgreSQL container starts
-- It ensures required extensions are available
-- ============================================================================

-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable pg_trgm extension for trigram text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Verify extensions are installed
SELECT extname, extversion 
FROM pg_extension 
WHERE extname IN ('vector', 'pg_trgm')
ORDER BY extname;
