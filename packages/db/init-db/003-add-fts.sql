-- ============================================================================
-- Full Text Search (FTS) Setup for WhatsApp Messages
-- ============================================================================
-- This script adds PostgreSQL Full Text Search support for message content
-- Replaces slow ILIKE queries with fast tsvector-based search
-- ============================================================================

-- Add tsvector column for full text search
ALTER TABLE whatsapp_message 
ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Create function to update search vector
CREATE OR REPLACE FUNCTION whatsapp_message_search_vector_update() 
RETURNS trigger AS $$
BEGIN
    NEW.search_vector := 
        setweight(to_tsvector('english', coalesce(NEW.text, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(NEW.caption, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(NEW.sender_push_name, '')), 'C');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update search vector
DROP TRIGGER IF EXISTS whatsapp_message_search_vector_trigger ON whatsapp_message;
CREATE TRIGGER whatsapp_message_search_vector_trigger
BEFORE INSERT OR UPDATE OF text, caption, sender_push_name
ON whatsapp_message
FOR EACH ROW
EXECUTE FUNCTION whatsapp_message_search_vector_update();

-- Populate search vector for existing rows
UPDATE whatsapp_message
SET search_vector = 
    setweight(to_tsvector('english', coalesce(text, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(caption, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(sender_push_name, '')), 'C')
WHERE search_vector IS NULL;

-- Create GIN index on search vector for fast FTS queries
CREATE INDEX IF NOT EXISTS whatsapp_message_search_vector_idx 
ON whatsapp_message 
USING gin (search_vector);
