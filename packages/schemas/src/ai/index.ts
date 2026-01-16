/**
 * AI Schemas
 *
 * Schemas for AI-powered features including extraction and analysis.
 */

export {
  medicationSchema,
  messageExtractionSchema,
  type Medication,
  type MessageExtraction,
} from './extraction';

export {
  userAISettings,
  updateAISettingsInput,
  aiSettingsResponse,
  autoProcessStatsResponse,
  type UserAISettings,
  type UpdateAISettingsInput,
  type AISettingsResponse,
  type AutoProcessStatsResponse,
} from './settings';
