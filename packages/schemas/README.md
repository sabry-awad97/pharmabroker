# @pharmabroker/schemas

Centralized Zod schema definitions with branded types for the PharmaBroker application.

## Features

- **Branded Types**: Nominal typing prevents mixing up similar types (e.g., `SessionID` vs `MessageID`)
- **Runtime Validation**: Full Zod validation with detailed error messages
- **Type Inference**: Automatic TypeScript types via `z.infer`
- **Type Guards**: Built-in type guard functions for runtime checks

## Installation

```bash
bun add @pharmabroker/schemas
```

## Branded Types

Branded types create nominal types that prevent accidentally mixing up similar values:

```ts
import type {
  SessionID,
  MessageID,
  E164Phone,
} from '@pharmabroker/schemas/whatsapp';

// These are all strings at runtime, but TypeScript treats them as distinct types
function sendMessage(sessionId: SessionID, to: E164Phone) {
  // ...
}

const sessionId: SessionID = '...' as SessionID;
const messageId: MessageID = '...' as MessageID;
const phone: E164Phone = '+1234567890' as E164Phone;

sendMessage(sessionId, phone); // ✅ OK
sendMessage(messageId, phone); // ❌ Type error! MessageID is not SessionID
sendMessage(sessionId, sessionId); // ❌ Type error! SessionID is not E164Phone
```

### Available Branded Types

| Type             | Description                    |
| ---------------- | ------------------------------ |
| `UUID`           | Generic UUID v4                |
| `SessionID`      | WhatsApp session identifier    |
| `MessageID`      | WhatsApp message identifier    |
| `WhatsAppJID`    | WhatsApp Jabber ID             |
| `E164Phone`      | E.164 phone number format      |
| `DateTime`       | ISO 8601 datetime string       |
| `URL`            | Valid URL string               |
| `NonEmptyString` | Non-empty string               |
| `TextContent`    | Message text (max 4096 chars)  |
| `Caption`        | Media caption (max 1024 chars) |
| `Filename`       | File name (max 255 chars)      |
| `QRCodeData`     | Base64 QR code data            |

## Usage

### Validate and brand data

```ts
import { sessionId, e164Phone } from '@pharmabroker/schemas/common';

// Parse returns branded type
const id = sessionId.parse('550e8400-e29b-41d4-a716-446655440000');
// id is now type SessionID (branded string)

const phone = e164Phone.parse('+1234567890');
// phone is now type E164Phone (branded string)

// Safe parse for error handling
const result = sessionId.safeParse(userInput);
if (result.success) {
  // result.data is SessionID
}
```

### Type guards

```ts
import { isUUID, isE164Phone, isDateTime } from '@pharmabroker/schemas/common';

if (isUUID(value)) {
  // value is UUID
}

if (isE164Phone(value)) {
  // value is E164Phone
}
```

### Create custom branded types

```ts
import {
  brandedString,
  brandedUuid,
  brandedNumber,
} from '@pharmabroker/schemas/common';

// Create your own branded types
const UserId = brandedUuid<'UserId'>();
type UserId = z.infer<typeof UserId>;

const Price = brandedNumber<'Price'>();
type Price = z.infer<typeof Price>;

const SKU = brandedString<'SKU'>();
type SKU = z.infer<typeof SKU>;
```

### Unbranded versions

For cases where you need flexible validation without branding:

```ts
import { unbranded } from '@pharmabroker/schemas/common';

// These validate but don't brand
const id = unbranded.uuid.parse('...'); // type: string
const phone = unbranded.e164Phone.parse('+1234567890'); // type: string
```

## Package Structure

```
@pharmabroker/schemas
├── common/              # Shared primitives & utilities
│   ├── uuid             # UUID v4 (branded)
│   ├── sessionId        # Session ID (branded UUID)
│   ├── messageId        # Message ID (branded UUID)
│   ├── e164Phone        # E.164 phone (branded)
│   ├── datetime         # ISO 8601 datetime (branded)
│   ├── url              # URL (branded)
│   ├── whatsappJid      # WhatsApp JID (branded)
│   ├── apiResponse      # Standard API response wrapper
│   ├── pagination       # Pagination schemas
│   └── brandedString/Uuid/Number  # Brand helpers
│
└── whatsapp/            # WhatsApp service schemas
    ├── session          # Session management
    ├── message          # Message sending
    ├── events           # Real-time events
    └── health           # Health check responses
```

## WhatsApp Schemas

### Sessions

```ts
import {
  session,
  createSessionInput,
  sessionIdInput,
} from '@pharmabroker/schemas/whatsapp';
import type { Session, SessionID } from '@pharmabroker/schemas/whatsapp';

// Session has branded fields
type Session = {
  id: SessionID; // branded
  jid?: WhatsAppJID; // branded
  name: string & Brand<'SessionName'>;
  status: 'pending' | 'connected' | 'disconnected' | 'expired';
  created_at: DateTime; // branded
  updated_at: DateTime; // branded
};
```

### Messages

```ts
import {
  sendMessageInput,
  textMessageInput,
} from '@pharmabroker/schemas/whatsapp';
import type {
  SendMessageInput,
  E164Phone,
  SessionID,
} from '@pharmabroker/schemas/whatsapp';

// Type-safe message with branded fields
const message: SendMessageInput = {
  session_id: sessionId, // must be SessionID
  to: phone, // must be E164Phone
  type: 'text',
  content: { text: 'Hello!' },
};
```

### Events

```ts
import { whatsappEvent, qrEvent } from '@pharmabroker/schemas/whatsapp';
import type {
  WhatsAppEvent,
  QREvent,
  SessionID,
} from '@pharmabroker/schemas/whatsapp';

// Events have branded session_id
type MessageReceivedEvent = {
  type: 'message.received';
  session_id: SessionID; // branded
  data: Record<string, unknown>;
};
```

## Type Helpers

```ts
import { z, Infer, InferInput, InferOutput } from '@pharmabroker/schemas';

// Extract type from any schema
type MySession = Infer<typeof session>;

// Input type (before transforms)
type Input = InferInput<typeof mySchema>;

// Output type (after transforms)
type Output = InferOutput<typeof mySchema>;
```
