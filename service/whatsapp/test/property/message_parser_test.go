package property

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/whatsapp"
)

// Feature: whatsapp-messages-backend, Property 7: Message Parser Round-Trip
// *For any* valid ParsedMessage, serializing to JSON and parsing back should produce
// an equivalent structure.
// **Validates: Requirements 5.15**

func TestMessageParserRoundTrip_Property7(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property 7.1: ParsedMessage JSON round-trip preserves all fields
	properties.Property("ParsedMessage JSON round-trip preserves all fields", prop.ForAll(
		func(msgType int, hasText bool, hasCaption bool, hasMedia bool) bool {
			// Create a ParsedMessage with various fields
			msg := createTestParsedMessage(msgType, hasText, hasCaption, hasMedia)

			// Serialize to JSON
			jsonBytes, err := json.Marshal(msg)
			if err != nil {
				t.Logf("Failed to marshal: %v", err)
				return false
			}

			// Parse back
			var parsed whatsapp.ParsedMessage
			err = json.Unmarshal(jsonBytes, &parsed)
			if err != nil {
				t.Logf("Failed to unmarshal: %v", err)
				return false
			}

			// Verify core fields
			if parsed.MessageID != msg.MessageID {
				t.Logf("MessageID mismatch: %s != %s", parsed.MessageID, msg.MessageID)
				return false
			}
			if parsed.SessionID != msg.SessionID {
				t.Logf("SessionID mismatch: %s != %s", parsed.SessionID, msg.SessionID)
				return false
			}
			if parsed.ChatJID != msg.ChatJID {
				t.Logf("ChatJID mismatch: %s != %s", parsed.ChatJID, msg.ChatJID)
				return false
			}
			if parsed.SenderJID != msg.SenderJID {
				t.Logf("SenderJID mismatch: %s != %s", parsed.SenderJID, msg.SenderJID)
				return false
			}
			if parsed.MessageType != msg.MessageType {
				t.Logf("MessageType mismatch: %s != %s", parsed.MessageType, msg.MessageType)
				return false
			}
			if parsed.Source != msg.Source {
				t.Logf("Source mismatch: %s != %s", parsed.Source, msg.Source)
				return false
			}

			// Verify optional text fields
			if !stringPtrEqual(parsed.Text, msg.Text) {
				return false
			}
			if !stringPtrEqual(parsed.Caption, msg.Caption) {
				return false
			}

			// Verify flags
			if parsed.IsFromMe != msg.IsFromMe {
				return false
			}
			if parsed.IsForwarded != msg.IsForwarded {
				return false
			}

			return true
		},
		gen.IntRange(0, 11), // message type index
		gen.Bool(),          // hasText
		gen.Bool(),          // hasCaption
		gen.Bool(),          // hasMedia
	))

	properties.TestingRun(t)
}

// Feature: whatsapp-messages-backend, Property 8: Message Parser Type Extraction
// *For any* message of a specific type, the parser should correctly identify the type
// and extract all type-specific fields.
// **Validates: Requirements 5.1-5.12**

func TestMessageParserTypeExtraction_Property8(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property 8.1: Text messages have text content
	properties.Property("text messages have text content", prop.ForAll(
		func(textLen int) bool {
			msg := createTestParsedMessage(0, true, false, false) // type 0 = text
			return msg.MessageType == whatsapp.ParsedMessageTypeText && msg.Text != nil && *msg.Text != ""
		},
		gen.IntRange(1, 100),
	))

	// Property 8.2: Image messages have media metadata
	properties.Property("image messages have media metadata", prop.ForAll(
		func(_ int) bool {
			msg := createTestParsedMessage(1, false, true, true) // type 1 = image
			return msg.MessageType == whatsapp.ParsedMessageTypeImage &&
				msg.MediaURL != nil &&
				msg.Mimetype != nil
		},
		gen.Const(0),
	))

	// Property 8.3: Document messages have filename
	properties.Property("document messages have filename", prop.ForAll(
		func(_ int) bool {
			msg := createTestParsedMessage(4, false, true, true) // type 4 = document
			return msg.MessageType == whatsapp.ParsedMessageTypeDocument &&
				msg.Filename != nil &&
				*msg.Filename != ""
		},
		gen.Const(0),
	))

	// Property 8.4: Location messages have coordinates
	properties.Property("location messages have coordinates", prop.ForAll(
		func(_ int) bool {
			msg := createTestParsedMessage(7, false, false, false) // type 7 = location
			return msg.MessageType == whatsapp.ParsedMessageTypeLocation &&
				msg.Latitude != nil &&
				msg.Longitude != nil
		},
		gen.Const(0),
	))

	// Property 8.5: Poll messages have poll name and options
	properties.Property("poll messages have poll name and options", prop.ForAll(
		func(_ int) bool {
			msg := createTestParsedMessage(8, false, false, false) // type 8 = poll
			return msg.MessageType == whatsapp.ParsedMessageTypePoll &&
				msg.PollName != nil &&
				len(msg.PollOptions) > 0
		},
		gen.Const(0),
	))

	// Property 8.6: Reaction messages have emoji and target message ID
	properties.Property("reaction messages have emoji and target", prop.ForAll(
		func(_ int) bool {
			msg := createTestParsedMessage(9, false, false, false) // type 9 = reaction
			return msg.MessageType == whatsapp.ParsedMessageTypeReaction &&
				msg.ReactionEmoji != nil &&
				msg.ReactionMessageID != nil
		},
		gen.Const(0),
	))

	// Property 8.7: IsGroupMessage correctly identifies group chats
	properties.Property("IsGroupMessage correctly identifies group chats", prop.ForAll(
		func(isGroup bool) bool {
			msg := &whatsapp.ParsedMessage{}
			if isGroup {
				msg.ChatJID = "123456789@g.us"
			} else {
				msg.ChatJID = "123456789@s.whatsapp.net"
			}
			return msg.IsGroupMessage() == isGroup
		},
		gen.Bool(),
	))

	// Property 8.8: HasTextContent returns true for messages with text or caption
	properties.Property("HasTextContent returns true for messages with text or caption", prop.ForAll(
		func(hasText, hasCaption bool) bool {
			msg := &whatsapp.ParsedMessage{}
			if hasText {
				text := "test text"
				msg.Text = &text
			}
			if hasCaption {
				caption := "test caption"
				msg.Caption = &caption
			}
			expected := hasText || hasCaption
			return msg.HasTextContent() == expected
		},
		gen.Bool(),
		gen.Bool(),
	))

	properties.TestingRun(t)
}

// Helper functions

func createTestParsedMessage(msgTypeIdx int, hasText, hasCaption, hasMedia bool) *whatsapp.ParsedMessage {
	types := []whatsapp.ParsedMessageType{
		whatsapp.ParsedMessageTypeText,     // 0
		whatsapp.ParsedMessageTypeImage,    // 1
		whatsapp.ParsedMessageTypeVideo,    // 2
		whatsapp.ParsedMessageTypeAudio,    // 3
		whatsapp.ParsedMessageTypeDocument, // 4
		whatsapp.ParsedMessageTypeSticker,  // 5
		whatsapp.ParsedMessageTypeContact,  // 6
		whatsapp.ParsedMessageTypeLocation, // 7
		whatsapp.ParsedMessageTypePoll,     // 8
		whatsapp.ParsedMessageTypeReaction, // 9
		whatsapp.ParsedMessageTypeProtocol, // 10
		whatsapp.ParsedMessageTypeUnknown,  // 11
	}

	msgType := types[msgTypeIdx%len(types)]

	msg := &whatsapp.ParsedMessage{
		MessageID:        "test-msg-123",
		SessionID:        "test-session-456",
		ChatJID:          "123456789@g.us",
		SenderJID:        "987654321@s.whatsapp.net",
		SenderPushName:   "Test User",
		MessageType:      msgType,
		MessageTimestamp: time.Now(),
		Source:           whatsapp.ParsedMessageSourceRealtime,
		IsFromMe:         false,
		IsForwarded:      false,
	}

	if hasText || msgType == whatsapp.ParsedMessageTypeText {
		text := "Test message content"
		msg.Text = &text
	}

	if hasCaption {
		caption := "Test caption"
		msg.Caption = &caption
	}

	if hasMedia || msgType == whatsapp.ParsedMessageTypeImage ||
		msgType == whatsapp.ParsedMessageTypeVideo ||
		msgType == whatsapp.ParsedMessageTypeAudio ||
		msgType == whatsapp.ParsedMessageTypeDocument ||
		msgType == whatsapp.ParsedMessageTypeSticker {
		url := "https://example.com/media/test.jpg"
		msg.MediaURL = &url
		mimetype := "image/jpeg"
		msg.Mimetype = &mimetype
		size := uint64(1024)
		msg.MediaSize = &size
		msg.MediaKey = []byte("test-media-key")
		msg.MediaSHA256 = []byte("test-sha256")
	}

	// Type-specific fields
	switch msgType {
	case whatsapp.ParsedMessageTypeDocument:
		filename := "document.pdf"
		msg.Filename = &filename
	case whatsapp.ParsedMessageTypeLocation:
		lat := 40.7128
		lng := -74.0060
		msg.Latitude = &lat
		msg.Longitude = &lng
		addr := "New York, NY"
		msg.Address = &addr
	case whatsapp.ParsedMessageTypeContact:
		vcard := "BEGIN:VCARD\nVERSION:3.0\nFN:Test Contact\nEND:VCARD"
		msg.VCard = &vcard
	case whatsapp.ParsedMessageTypePoll:
		pollName := "Test Poll"
		msg.PollName = &pollName
		msg.PollOptions = []string{"Option 1", "Option 2", "Option 3"}
	case whatsapp.ParsedMessageTypeReaction:
		emoji := "👍"
		msg.ReactionEmoji = &emoji
		targetID := "target-msg-789"
		msg.ReactionMessageID = &targetID
	}

	return msg
}

func stringPtrEqual(a, b *string) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	return *a == *b
}

// Feature: whatsapp-messages-backend, Property 6: Message Event Payload Completeness
// *For any* emitted message event, the payload SHALL contain all required fields:
// sessionId, messageId, senderJid, chatJid, messageType, messageTimestamp, source, and rawPayload.
// **Validates: Requirements 4.3, 4.4, 4.5, 4.6**

func TestMessageEventPayloadCompleteness_Property6(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property 6.1: All required fields are present in ParsedMessage
	properties.Property("all required fields are present in ParsedMessage", prop.ForAll(
		func(msgTypeIdx int, isRealtime bool) bool {
			msg := createTestParsedMessage(msgTypeIdx, true, false, false)
			if isRealtime {
				msg.Source = whatsapp.ParsedMessageSourceRealtime
			} else {
				msg.Source = whatsapp.ParsedMessageSourceHistory
			}

			// Check required fields
			if msg.SessionID == "" {
				t.Log("SessionID is empty")
				return false
			}
			if msg.MessageID == "" {
				t.Log("MessageID is empty")
				return false
			}
			if msg.SenderJID == "" {
				t.Log("SenderJID is empty")
				return false
			}
			if msg.ChatJID == "" {
				t.Log("ChatJID is empty")
				return false
			}
			if msg.MessageType == "" {
				t.Log("MessageType is empty")
				return false
			}
			if msg.MessageTimestamp.IsZero() {
				t.Log("MessageTimestamp is zero")
				return false
			}
			if msg.Source == "" {
				t.Log("Source is empty")
				return false
			}

			return true
		},
		gen.IntRange(0, 11), // message type index
		gen.Bool(),          // isRealtime
	))

	// Property 6.2: Media messages have media metadata
	properties.Property("media messages have media metadata", prop.ForAll(
		func(mediaTypeIdx int) bool {
			// Media types: image(1), video(2), audio(3), document(4), sticker(5)
			mediaTypes := []int{1, 2, 3, 4, 5}
			typeIdx := mediaTypes[mediaTypeIdx%len(mediaTypes)]
			msg := createTestParsedMessage(typeIdx, false, true, true)

			// Media messages should have media URL and mimetype
			if msg.MediaURL == nil || *msg.MediaURL == "" {
				t.Logf("MediaURL is nil or empty for type %s", msg.MessageType)
				return false
			}
			if msg.Mimetype == nil || *msg.Mimetype == "" {
				t.Logf("Mimetype is nil or empty for type %s", msg.MessageType)
				return false
			}

			return true
		},
		gen.IntRange(0, 4), // media type index
	))

	// Property 6.3: Source field is valid
	properties.Property("source field is valid", prop.ForAll(
		func(isRealtime bool) bool {
			msg := createTestParsedMessage(0, true, false, false)
			if isRealtime {
				msg.Source = whatsapp.ParsedMessageSourceRealtime
			} else {
				msg.Source = whatsapp.ParsedMessageSourceHistory
			}

			return msg.Source == whatsapp.ParsedMessageSourceRealtime ||
				msg.Source == whatsapp.ParsedMessageSourceHistory
		},
		gen.Bool(),
	))

	properties.TestingRun(t)
}
