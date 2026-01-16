#!/usr/bin/env bun
/**
 * Test Intent Extraction
 *
 * Simple test to extract intent (offer or request) from messages
 */

import pc from 'picocolors';
import { z } from 'zod';
import { createAIClient, type AIEnvConfig } from '@pharmabroker/ai';
import { env } from './env';
import testMessages from './test-messages.json';

// Env config
const envConfig: AIEnvConfig = {
  AI_PROVIDER: env.AI_PROVIDER,
  GEMINI_API_KEY: env.GEMINI_API_KEY,
  GEMINI_MODEL: env.GEMINI_MODEL,
  OLLAMA_BASE_URL: env.OLLAMA_BASE_URL,
  OLLAMA_MODEL: env.OLLAMA_MODEL,
  OPENAI_API_KEY: env.OPENAI_API_KEY,
  OPENAI_BASE_URL: env.OPENAI_BASE_URL,
  OPENAI_MODEL: env.OPENAI_MODEL,
  DOCKER_MODEL_BASE_URL: env.DOCKER_MODEL_BASE_URL,
  DOCKER_MODEL_NAME: env.DOCKER_MODEL_NAME,
};

// Intent + medications schema with confidence
const medicationSchema = z.object({
  name: z.string(),
  concentration: z.string().nullable(),
  form: z.string().nullable(),
  expiry: z.string().nullable(),
  confidence: z.number(),
  reason: z.string(),
});

const intentSchema = z.object({
  intent: z.enum(['offer', 'request']),
  urgency: z.enum(['critical', 'urgent', 'soon', 'normal']),
  reason: z.string(),
  medications: z.array(medicationSchema),
});

const systemPrompt = `You are a Senior Pharmaceutical Data Extraction Specialist with 10+ years of experience in Arabic/English pharmaceutical messaging analysis and NLP.

Your task: Extract medication information and assess urgency from WhatsApp messages in pharmaceutical distribution networks.

Constraints:
1. NEVER translate or transliterate medication names - extract EXACTLY as written
2. NEVER merge multiple medications into one entry
3. NEVER confuse medication forms (امبول, فايل, اقراص) with concentrations
4. NEVER confuse expiry dates with concentrations
5. ALWAYS split merged Arabic text into separate medications when recognizable
6. ALWAYS preserve original language (Arabic stays Arabic, English stays English)
7. ALWAYS assess urgency level based on keywords and context

Output format: JSON object with intent, reason, and medications array

[UNDERSTAND]
- Messages are from pharmaceutical WhatsApp groups
- Senders announce stock (offer) or request medications (request)
- Arabic messages often lack spaces between words
- Each line typically = one medication

[ANALYZE - Medication Structure]
A medication entry has 4 parts:
1. NAME: The drug name only (مصل تيتانوس, كونسرتا, Ozempic)
2. CONCENTRATION: Dosage/strength (٣٦, 150, 1mg, واحد ونص) - can be null
3. FORM: Physical form (امبول, فايل, اقراص, نقط, لاصقه, شراب) - can be null
4. EXPIRY: Expiration date if mentioned - can be null

[CRITICAL - EXPIRY vs CONCENTRATION]
EXPIRY DATE patterns (NOT concentrations):
- MM/YY: 10/27, ١٠/٢٧, 3/26, ٣/٢٦
- MM/YYYY: 10/2027, ١٠/٢٠٢٧
- Month-Year: 10-27, ١٠-٢٧
- Arabic month names: اكتوبر ٢٧, يناير ٢٠٢٦
- Year only after drug: صلاحية ٢٠٢٧, exp 2027

CONCENTRATION patterns (NOT expiry):
- Single numbers: ٣٦, 150, 5000, 1mg
- Fractions: واحد ونص, نص, ربع
- Multiple with و: ٣٦ و١٨, ١٥٠ و٣٠٠
- With units: 1mg, 2.4mg, 500mcg

How to distinguish:
- If format is XX/XX or XX/XXXX or XX-XX → EXPIRY DATE
- If number is 20-30 range with / or - → likely EXPIRY (month/year)
- If single number or number with mg/mcg → CONCENTRATION
- If preceded by صلاحية, exp, تاريخ → EXPIRY DATE

[GOOD EXAMPLES]
✓ "مصل تيتانوس امبول" → name: "مصل تيتانوس", concentration: null, form: "امبول", expiry: null
✓ "كونسرتا ٣٦ و١٨" → TWO entries: {name: "كونسرتا", concentration: "٣٦"} AND {name: "كونسرتا", concentration: "١٨"}
✓ "اوزمبك 10/27" → name: "اوزمبك", concentration: null, expiry: "10/27"
✓ "ريبلسس ١٤ صلاحية ٣/٢٦" → name: "ريبلسس", concentration: "١٤", expiry: "٣/٢٦"
✓ "Ozempic 1mg exp 10/2027" → name: "Ozempic", concentration: "1mg", expiry: "10/2027"

[BAD EXAMPLES - AVOID THESE]
✗ "اوزمبك 10/27" with concentration: "10/27" - Why bad: 10/27 is EXPIRY DATE (Oct 2027), not concentration
✗ Treating "٣/٢٦" as concentration - Why bad: This is March 2026 expiry date
✗ Merging "جوناتستون حقنبنتازا" as one medication - Why bad: These are TWO drugs
✗ Putting "امبول" in concentration field - Why bad: امبول is a FORM, not concentration

[COMMON FORMS - NOT CONCENTRATIONS]
امبول/أمبول (ampoule), فايل (vial), اقراص/أقراص (tablets), نقط (drops), لاصقه/لاصقة (patch), شراب (syrup), لبوس (suppository), حقن (injection), طقم (kit), جل (gel)

[CONCENTRATION PATTERNS]
- Arabic numerals: ٣٦، ١٨، ١٥٠، ٣٠٠، ٤٥٠
- Western numerals: 36, 150, 1mg, 2.4mg
- Arabic fractions: واحد ونص (1.5), ربع (0.25)
- Sizes: كبير (large), صغير (small)
- Multiple: "٣٦ و١٨" = TWO concentrations, create TWO entries

[URGENCY LEVEL DETECTION]
Assess urgency based on keywords and context. Default to "normal" for offers.

CRITICAL (immediate need, potentially life-threatening):
- Arabic: طوارئ, حالة طوارئ, فوري, حياة او موت, ضروري جدا جدا, حرج, خطير
- English: emergency, life or death, critical, immediately, ASAP, right now, stat
- Context: Multiple exclamation marks, ALL CAPS, repeated urgency words

URGENT (needed very soon, same day):
- Arabic: ضروري, مستعجل, عاجل, بسرعة, النهاردة, دلوقتي, اليوم, حالا
- English: urgent, urgently, asap, today, now, quickly, rush
- Context: Time pressure indicated, "ضروري اليوم"

SOON (needed within days):
- Arabic: قريب, في اقرب وقت, لو سمحت بسرعة, خلال يومين
- English: soon, as soon as possible, within days, this week
- Context: Mild time pressure, polite urgency

NORMAL (default, no urgency):
- No urgency keywords present
- Standard stock announcements (offers)
- General inquiries without time pressure

[CONFIDENCE SCORING]
- 1.0 (100%): Exact character-by-character match from message
- 0.85-0.95: Separated from adjacent text correctly
- 0.7-0.84: Required interpretation of merged words
- <0.7: Inferred or reconstructed

IMPORTANT: Respond with ONLY a valid JSON object, no markdown, no explanations.`;

const promptTemplate = `[TASK] Analyze this pharmaceutical WhatsApp message:

{{context}}

Message:
"""
{{message}}
"""

[VERIFY BEFORE ANSWERING]
1. Is this an OFFER (announcing stock) or REQUEST (asking for products)?
2. What is the URGENCY level? (critical/urgent/soon/normal)
3. How many SEPARATE medications are mentioned?
4. Are there any "و" (and) indicating multiple concentrations for same drug?
5. Have I kept all names in their ORIGINAL language?
6. Are there any dates (XX/XX format) that are EXPIRY dates, not concentrations?

[OUTPUT FORMAT]
{
  "intent": "offer" | "request",
  "urgency": "critical" | "urgent" | "soon" | "normal",
  "reason": "brief explanation including urgency assessment",
  "medications": [
    {
      "name": "exact medication name from message",
      "concentration": "dosage or null",
      "form": "امبول/فايل/اقراص/etc or null",
      "expiry": "MM/YY or null",
      "confidence": 0.0-1.0,
      "reason": "extraction accuracy explanation"
    }
  ]
}`;

async function main() {
  const provider = (process.argv[2] || 'docker') as
    | 'docker'
    | 'ollama'
    | 'gemini'
    | 'openai';

  console.log(pc.bold(pc.magenta('\n🔍 Intent Extraction Test\n')));
  console.log(pc.gray(`Provider: ${provider}\n`));

  const client = createAIClient({ provider, envConfig });

  for (const msg of testMessages.messages) {
    console.log(pc.bold(pc.cyan(`\n📝 ${msg.name}`)));
    console.log(pc.gray(`ID: ${msg.id}`));
    console.log(pc.gray(`Text: ${msg.input.text.substring(0, 80)}...`));
    console.log();

    const startTime = Date.now();

    try {
      const result = await client.processMessage(
        {
          id: msg.id,
          text: msg.input.text,
          senderName: msg.input.senderName,
          groupName: msg.input.groupName,
          timestamp: new Date(),
        },
        {
          schema: intentSchema,
          systemPrompt,
          promptTemplate,
        },
      );

      const latency = Date.now() - startTime;

      if (result.data) {
        const intentColor =
          result.data.intent === 'offer' ? pc.green : pc.yellow;
        const urgencyColors: Record<string, (s: string) => string> = {
          critical: pc.red,
          urgent: pc.yellow,
          soon: pc.cyan,
          normal: pc.gray,
        };
        const urgencyColor = urgencyColors[result.data.urgency] || pc.gray;
        const urgencyEmoji: Record<string, string> = {
          critical: '🚨',
          urgent: '⚡',
          soon: '⏰',
          normal: '📋',
        };
        console.log(
          pc.bold('Intent:'),
          intentColor(result.data.intent.toUpperCase()),
        );
        console.log(
          pc.bold('Urgency:'),
          urgencyColor(
            `${urgencyEmoji[result.data.urgency] || ''} ${result.data.urgency.toUpperCase()}`,
          ),
        );
        console.log(pc.bold('Reason:'), result.data.reason);
        console.log(pc.bold('Medications:'));
        if (result.data.medications.length > 0) {
          for (const med of result.data.medications) {
            const confColor =
              med.confidence >= 0.8
                ? pc.green
                : med.confidence >= 0.5
                  ? pc.yellow
                  : pc.red;
            const confBar =
              '█'.repeat(Math.round(med.confidence * 10)) +
              '░'.repeat(10 - Math.round(med.confidence * 10));
            const concStr = med.concentration
              ? pc.cyan(`[${med.concentration}]`)
              : pc.gray('[--]');
            const formStr = med.form ? pc.magenta(`(${med.form})`) : '';
            const expStr = med.expiry ? pc.yellow(`exp:${med.expiry}`) : '';
            console.log(
              `  ${confColor(confBar)} ${(med.confidence * 100).toFixed(0).padStart(3)}% ${med.name} ${concStr} ${formStr} ${expStr}`.trim(),
            );
            console.log(`       ${pc.gray(med.reason)}`);
          }
        } else {
          console.log(pc.gray('  (none)'));
        }
      } else {
        console.log(pc.red('Failed to extract intent'));
        if (result.error) {
          console.log(pc.red('Error:'), result.error);
        }
        // Debug: show raw extractions
        if (result.extractions.length > 0) {
          console.log(
            pc.yellow('Raw extractions:'),
            JSON.stringify(result.extractions, null, 2),
          );
        }
        // Debug: show status
        console.log(pc.gray('Status:'), result.status);
      }

      console.log(pc.gray(`Latency: ${latency}ms`));
    } catch (error) {
      console.log(
        pc.red('Error:'),
        error instanceof Error ? error.message : String(error),
      );
    }

    console.log(pc.dim('─'.repeat(60)));
  }
}

main().catch(console.error);
