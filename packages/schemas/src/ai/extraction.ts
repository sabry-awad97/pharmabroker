/**
 * AI Extraction Schemas
 *
 * Schemas for AI-powered data extraction from pharmaceutical messages.
 */

import { z } from 'zod';

// ============================================================================
// Medication Extraction
// ============================================================================

/**
 * Schema for a single extracted medication
 */
export const medicationSchema = z.object({
  /** Medication name exactly as written (Arabic/English preserved) */
  name: z.string(),
  /** Dosage/strength (e.g., "٣٦", "150", "1mg") - null if not specified */
  concentration: z.string().nullable(),
  /** Physical form (e.g., "امبول", "فايل", "اقراص") - null if not specified */
  form: z.string().nullable(),
  /** Expiration date if mentioned (e.g., "10/27", "٣/٢٦") - null if not specified */
  expiry: z.string().nullable(),
  /** Confidence score 0-1 for extraction accuracy */
  confidence: z.number().min(0).max(1),
  /** Explanation of extraction accuracy */
  reason: z.string(),
});

export type Medication = z.infer<typeof medicationSchema>;

/**
 * Schema for message extraction result
 */
export const messageExtractionSchema = z.object({
  /** Message intent: offer (announcing stock) or request (asking for products) */
  intent: z.enum(['offer', 'request']),
  /** Urgency level based on keywords and context */
  urgency: z.enum(['critical', 'urgent', 'soon', 'normal']),
  /** Brief explanation of intent and urgency assessment */
  reason: z.string(),
  /** Array of extracted medications */
  medications: z.array(medicationSchema),
});

export type MessageExtraction = z.infer<typeof messageExtractionSchema>;
