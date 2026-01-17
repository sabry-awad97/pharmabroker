-- ============================================================================
-- Database Initialization: Extensions
-- ============================================================================
-- This script runs automatically when the PostgreSQL container starts
-- It ensures required extensions are available
-- ============================================================================

-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Verify extension is installed
SELECT extname, extversion 
FROM pg_extension 
WHERE extname = 'vector';
