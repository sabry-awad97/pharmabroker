package unit

import (
	"testing"
	"time"

	"github.com/pharmabroker/whatsapp/internal/infrastructure/whatsapp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.mau.fi/whatsmeow/proto/waCommon"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	"google.golang.org/protobuf/proto"
)

// Feature: whatsapp-messages-backend
// Unit tests for message parser edge cases
// **Validates: Requirements 5.12**

func TestMessageParser_ParseRealtimeMessage(t *testing.T) {
	parser := whatsapp.NewMessageParser()

	t.Run("parses text message correctly", func(t *testing.T) {
		evt := createTextMessageEvent("Hello, World!")

		msg, err := parser.ParseRealtimeMessage("session-123", evt)

		require.NoError(t, err)
		assert.Equal(t, "session-123", msg.SessionID)
		assert.Equal(t, whatsapp.ParsedMessageTypeText, msg.MessageType)
		assert.NotNil(t, msg.Text)
		assert.Equal(t, "Hello, World!", *msg.Text)
		assert.Equal(t, whatsapp.ParsedMessageSourceRealtime, msg.Source)
	})

	t.Run("parses extended text message correctly", func(t *testing.T) {
		evt := createExtendedTextMessageEvent("Extended text content")

		msg, err := parser.ParseRealtimeMessage("session-123", evt)

		require.NoError(t, err)
		assert.Equal(t, whatsapp.ParsedMessageTypeText, msg.MessageType)
		assert.NotNil(t, msg.Text)
		assert.Equal(t, "Extended text content", *msg.Text)
	})

	t.Run("parses image message with caption", func(t *testing.T) {
		evt := createImageMessageEvent("https://example.com/image.jpg", "Image caption")

		msg, err := parser.ParseRealtimeMessage("session-123", evt)

		require.NoError(t, err)
		assert.Equal(t, whatsapp.ParsedMessageTypeImage, msg.MessageType)
		assert.NotNil(t, msg.MediaURL)
		assert.Equal(t, "https://example.com/image.jpg", *msg.MediaURL)
		assert.NotNil(t, msg.Caption)
		assert.Equal(t, "Image caption", *msg.Caption)
	})

	t.Run("parses document message with filename", func(t *testing.T) {
		evt := createDocumentMessageEvent("https://example.com/doc.pdf", "document.pdf", "application/pdf")

		msg, err := parser.ParseRealtimeMessage("session-123", evt)

		require.NoError(t, err)
		assert.Equal(t, whatsapp.ParsedMessageTypeDocument, msg.MessageType)
		assert.NotNil(t, msg.Filename)
		assert.Equal(t, "document.pdf", *msg.Filename)
		assert.NotNil(t, msg.Mimetype)
		assert.Equal(t, "application/pdf", *msg.Mimetype)
	})

	t.Run("parses location message with coordinates", func(t *testing.T) {
		evt := createLocationMessageEvent(40.7128, -74.0060, "New York")

		msg, err := parser.ParseRealtimeMessage("session-123", evt)

		require.NoError(t, err)
		assert.Equal(t, whatsapp.ParsedMessageTypeLocation, msg.MessageType)
		assert.NotNil(t, msg.Latitude)
		assert.InDelta(t, 40.7128, *msg.Latitude, 0.0001)
		assert.NotNil(t, msg.Longitude)
		assert.InDelta(t, -74.0060, *msg.Longitude, 0.0001)
	})

	t.Run("parses reaction message", func(t *testing.T) {
		evt := createReactionMessageEvent("👍", "target-msg-123")

		msg, err := parser.ParseRealtimeMessage("session-123", evt)

		require.NoError(t, err)
		assert.Equal(t, whatsapp.ParsedMessageTypeReaction, msg.MessageType)
		assert.NotNil(t, msg.ReactionEmoji)
		assert.Equal(t, "👍", *msg.ReactionEmoji)
		assert.NotNil(t, msg.ReactionMessageID)
		assert.Equal(t, "target-msg-123", *msg.ReactionMessageID)
	})

	t.Run("handles nil message gracefully", func(t *testing.T) {
		evt := &events.Message{
			Info: types.MessageInfo{
				MessageSource: types.MessageSource{
					Chat:   types.JID{User: "123456789", Server: "g.us"},
					Sender: types.JID{User: "987654321", Server: "s.whatsapp.net"},
				},
				ID:        "msg-123",
				Timestamp: time.Now(),
			},
			Message: nil,
		}

		msg, err := parser.ParseRealtimeMessage("session-123", evt)

		require.NoError(t, err)
		assert.Equal(t, whatsapp.ParsedMessageTypeUnknown, msg.MessageType)
	})

	t.Run("handles empty message gracefully", func(t *testing.T) {
		evt := &events.Message{
			Info: types.MessageInfo{
				MessageSource: types.MessageSource{
					Chat:   types.JID{User: "123456789", Server: "g.us"},
					Sender: types.JID{User: "987654321", Server: "s.whatsapp.net"},
				},
				ID:        "msg-123",
				Timestamp: time.Now(),
			},
			Message: &waE2E.Message{},
		}

		msg, err := parser.ParseRealtimeMessage("session-123", evt)

		require.NoError(t, err)
		assert.Equal(t, whatsapp.ParsedMessageTypeUnknown, msg.MessageType)
	})

	t.Run("extracts push name from message info", func(t *testing.T) {
		evt := createTextMessageEvent("Hello")
		evt.Info.PushName = "John Doe"

		msg, err := parser.ParseRealtimeMessage("session-123", evt)

		require.NoError(t, err)
		assert.Equal(t, "John Doe", msg.SenderPushName)
	})

	t.Run("extracts IsFromMe flag", func(t *testing.T) {
		evt := createTextMessageEvent("Hello")
		evt.Info.IsFromMe = true

		msg, err := parser.ParseRealtimeMessage("session-123", evt)

		require.NoError(t, err)
		assert.True(t, msg.IsFromMe)
	})

	t.Run("stores raw payload as JSON", func(t *testing.T) {
		evt := createTextMessageEvent("Hello")

		msg, err := parser.ParseRealtimeMessage("session-123", evt)

		require.NoError(t, err)
		assert.NotNil(t, msg.RawPayload)
		assert.True(t, len(msg.RawPayload) > 0)
	})
}

func TestMessageParser_ParseHistoryMessage(t *testing.T) {
	parser := whatsapp.NewMessageParser()

	t.Run("parses history message with source set to history", func(t *testing.T) {
		waMsg := &waE2E.Message{
			Conversation: proto.String("History message"),
		}
		info := &types.MessageInfo{
			MessageSource: types.MessageSource{
				Sender: types.JID{User: "123456789", Server: "s.whatsapp.net"},
			},
			ID:        "hist-msg-123",
			Timestamp: time.Now(),
		}

		msg, err := parser.ParseHistoryMessage("session-123", "group@g.us", waMsg, info)

		require.NoError(t, err)
		assert.Equal(t, whatsapp.ParsedMessageSourceHistory, msg.Source)
		assert.Equal(t, "hist-msg-123", msg.MessageID)
		assert.Equal(t, "group@g.us", msg.ChatJID)
	})

	t.Run("handles nil info gracefully", func(t *testing.T) {
		waMsg := &waE2E.Message{
			Conversation: proto.String("Message without info"),
		}

		msg, err := parser.ParseHistoryMessage("session-123", "group@g.us", waMsg, nil)

		require.NoError(t, err)
		assert.Equal(t, whatsapp.ParsedMessageSourceHistory, msg.Source)
		assert.Equal(t, "", msg.MessageID) // Empty when no info
	})
}

func TestParsedMessage_IsGroupMessage(t *testing.T) {
	t.Run("returns true for group JID", func(t *testing.T) {
		msg := &whatsapp.ParsedMessage{ChatJID: "123456789@g.us"}
		assert.True(t, msg.IsGroupMessage())
	})

	t.Run("returns false for individual JID", func(t *testing.T) {
		msg := &whatsapp.ParsedMessage{ChatJID: "123456789@s.whatsapp.net"}
		assert.False(t, msg.IsGroupMessage())
	})

	t.Run("returns false for empty JID", func(t *testing.T) {
		msg := &whatsapp.ParsedMessage{ChatJID: ""}
		assert.False(t, msg.IsGroupMessage())
	})

	t.Run("returns false for short JID", func(t *testing.T) {
		msg := &whatsapp.ParsedMessage{ChatJID: "abc"}
		assert.False(t, msg.IsGroupMessage())
	})
}

func TestParsedMessage_HasTextContent(t *testing.T) {
	t.Run("returns true when text is set", func(t *testing.T) {
		text := "Hello"
		msg := &whatsapp.ParsedMessage{Text: &text}
		assert.True(t, msg.HasTextContent())
	})

	t.Run("returns true when caption is set", func(t *testing.T) {
		caption := "Caption"
		msg := &whatsapp.ParsedMessage{Caption: &caption}
		assert.True(t, msg.HasTextContent())
	})

	t.Run("returns true when both text and caption are set", func(t *testing.T) {
		text := "Hello"
		caption := "Caption"
		msg := &whatsapp.ParsedMessage{Text: &text, Caption: &caption}
		assert.True(t, msg.HasTextContent())
	})

	t.Run("returns false when neither is set", func(t *testing.T) {
		msg := &whatsapp.ParsedMessage{}
		assert.False(t, msg.HasTextContent())
	})

	t.Run("returns false when text is empty string", func(t *testing.T) {
		text := ""
		msg := &whatsapp.ParsedMessage{Text: &text}
		assert.False(t, msg.HasTextContent())
	})
}

func TestParsedMessage_GetTextContent(t *testing.T) {
	t.Run("returns text when set", func(t *testing.T) {
		text := "Hello"
		msg := &whatsapp.ParsedMessage{Text: &text}
		assert.Equal(t, "Hello", msg.GetTextContent())
	})

	t.Run("returns caption when text is not set", func(t *testing.T) {
		caption := "Caption"
		msg := &whatsapp.ParsedMessage{Caption: &caption}
		assert.Equal(t, "Caption", msg.GetTextContent())
	})

	t.Run("prefers text over caption", func(t *testing.T) {
		text := "Text"
		caption := "Caption"
		msg := &whatsapp.ParsedMessage{Text: &text, Caption: &caption}
		assert.Equal(t, "Text", msg.GetTextContent())
	})

	t.Run("returns empty string when neither is set", func(t *testing.T) {
		msg := &whatsapp.ParsedMessage{}
		assert.Equal(t, "", msg.GetTextContent())
	})
}

// Helper functions to create test events

func createTextMessageEvent(text string) *events.Message {
	return &events.Message{
		Info: types.MessageInfo{
			MessageSource: types.MessageSource{
				Chat:   types.JID{User: "123456789", Server: "g.us"},
				Sender: types.JID{User: "987654321", Server: "s.whatsapp.net"},
			},
			ID:        "msg-123",
			Timestamp: time.Now(),
		},
		Message: &waE2E.Message{
			Conversation: proto.String(text),
		},
	}
}

func createExtendedTextMessageEvent(text string) *events.Message {
	return &events.Message{
		Info: types.MessageInfo{
			MessageSource: types.MessageSource{
				Chat:   types.JID{User: "123456789", Server: "g.us"},
				Sender: types.JID{User: "987654321", Server: "s.whatsapp.net"},
			},
			ID:        "msg-123",
			Timestamp: time.Now(),
		},
		Message: &waE2E.Message{
			ExtendedTextMessage: &waE2E.ExtendedTextMessage{
				Text: proto.String(text),
			},
		},
	}
}

func createImageMessageEvent(url, caption string) *events.Message {
	return &events.Message{
		Info: types.MessageInfo{
			MessageSource: types.MessageSource{
				Chat:   types.JID{User: "123456789", Server: "g.us"},
				Sender: types.JID{User: "987654321", Server: "s.whatsapp.net"},
			},
			ID:        "msg-123",
			Timestamp: time.Now(),
		},
		Message: &waE2E.Message{
			ImageMessage: &waE2E.ImageMessage{
				URL:      proto.String(url),
				Caption:  proto.String(caption),
				Mimetype: proto.String("image/jpeg"),
			},
		},
	}
}

func createDocumentMessageEvent(url, filename, mimetype string) *events.Message {
	return &events.Message{
		Info: types.MessageInfo{
			MessageSource: types.MessageSource{
				Chat:   types.JID{User: "123456789", Server: "g.us"},
				Sender: types.JID{User: "987654321", Server: "s.whatsapp.net"},
			},
			ID:        "msg-123",
			Timestamp: time.Now(),
		},
		Message: &waE2E.Message{
			DocumentMessage: &waE2E.DocumentMessage{
				URL:      proto.String(url),
				FileName: proto.String(filename),
				Mimetype: proto.String(mimetype),
			},
		},
	}
}

func createLocationMessageEvent(lat, lng float64, name string) *events.Message {
	return &events.Message{
		Info: types.MessageInfo{
			MessageSource: types.MessageSource{
				Chat:   types.JID{User: "123456789", Server: "g.us"},
				Sender: types.JID{User: "987654321", Server: "s.whatsapp.net"},
			},
			ID:        "msg-123",
			Timestamp: time.Now(),
		},
		Message: &waE2E.Message{
			LocationMessage: &waE2E.LocationMessage{
				DegreesLatitude:  proto.Float64(lat),
				DegreesLongitude: proto.Float64(lng),
				Name:             proto.String(name),
			},
		},
	}
}

func createReactionMessageEvent(emoji, targetMsgID string) *events.Message {
	return &events.Message{
		Info: types.MessageInfo{
			MessageSource: types.MessageSource{
				Chat:   types.JID{User: "123456789", Server: "g.us"},
				Sender: types.JID{User: "987654321", Server: "s.whatsapp.net"},
			},
			ID:        "msg-123",
			Timestamp: time.Now(),
		},
		Message: &waE2E.Message{
			ReactionMessage: &waE2E.ReactionMessage{
				Text: proto.String(emoji),
				Key: &waCommon.MessageKey{
					ID: proto.String(targetMsgID),
				},
			},
		},
	}
}
