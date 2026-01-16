package whatsapp

import (
	"encoding/json"
	"time"

	waE2E "go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
)

// ParsedMessageType represents the type of a parsed WhatsApp message
type ParsedMessageType string

const (
	ParsedMessageTypeText     ParsedMessageType = "text"
	ParsedMessageTypeImage    ParsedMessageType = "image"
	ParsedMessageTypeVideo    ParsedMessageType = "video"
	ParsedMessageTypeAudio    ParsedMessageType = "audio"
	ParsedMessageTypeDocument ParsedMessageType = "document"
	ParsedMessageTypeSticker  ParsedMessageType = "sticker"
	ParsedMessageTypeContact  ParsedMessageType = "contact"
	ParsedMessageTypeLocation ParsedMessageType = "location"
	ParsedMessageTypePoll     ParsedMessageType = "poll"
	ParsedMessageTypeReaction ParsedMessageType = "reaction"
	ParsedMessageTypeProtocol ParsedMessageType = "protocol"
	ParsedMessageTypeUnknown  ParsedMessageType = "unknown"
)

// ParsedMessageSource indicates where the message came from
type ParsedMessageSource string

const (
	ParsedMessageSourceRealtime ParsedMessageSource = "realtime"
	ParsedMessageSourceHistory  ParsedMessageSource = "history"
)

// ParsedMessage represents a parsed WhatsApp message ready for storage
type ParsedMessage struct {
	// Core identifiers
	MessageID string `json:"messageId"`
	SessionID string `json:"sessionId"`

	// Chat context
	ChatJID   string `json:"chatJid"`   // Group or individual chat JID
	SenderJID string `json:"senderJid"` // Sender's JID

	// Sender info
	SenderPushName string `json:"senderPushName,omitempty"`

	// Message type and content
	MessageType ParsedMessageType `json:"messageType"`
	Text        *string           `json:"text,omitempty"`
	Caption     *string           `json:"caption,omitempty"`
	Filename    *string           `json:"filename,omitempty"`
	Mimetype    *string           `json:"mimetype,omitempty"`

	// Media metadata
	MediaURL    *string `json:"mediaUrl,omitempty"`
	MediaKey    []byte  `json:"mediaKey,omitempty"`
	MediaSHA256 []byte  `json:"mediaSha256,omitempty"`
	MediaSize   *uint64 `json:"mediaSize,omitempty"`

	// Location data (for location messages)
	Latitude  *float64 `json:"latitude,omitempty"`
	Longitude *float64 `json:"longitude,omitempty"`
	Address   *string  `json:"address,omitempty"`

	// Contact data (for contact messages)
	VCard *string `json:"vcard,omitempty"`

	// Poll data (for poll messages)
	PollName    *string  `json:"pollName,omitempty"`
	PollOptions []string `json:"pollOptions,omitempty"`

	// Reaction data (for reaction messages)
	ReactionEmoji     *string `json:"reactionEmoji,omitempty"`
	ReactionMessageID *string `json:"reactionMessageId,omitempty"`

	// Message flags
	IsFromMe    bool `json:"isFromMe"`
	IsForwarded bool `json:"isForwarded"`
	IsViewOnce  bool `json:"isViewOnce"`
	IsBroadcast bool `json:"isBroadcast"`

	// Reply context
	QuotedMessageID *string `json:"quotedMessageId,omitempty"`

	// Timestamps
	MessageTimestamp time.Time `json:"messageTimestamp"`

	// Source tracking
	Source ParsedMessageSource `json:"source"`

	// Raw payload for debugging and future processing
	RawPayload json.RawMessage `json:"rawPayload,omitempty"`
}

// MessageParser parses WhatsApp message events into ParsedMessage structs
type MessageParser struct{}

// NewMessageParser creates a new MessageParser
func NewMessageParser() *MessageParser {
	return &MessageParser{}
}

// ParseRealtimeMessage parses a real-time message event from whatsmeow
func (p *MessageParser) ParseRealtimeMessage(sessionID string, evt *events.Message) (*ParsedMessage, error) {
	msg := &ParsedMessage{
		MessageID:        evt.Info.ID,
		SessionID:        sessionID,
		ChatJID:          evt.Info.Chat.String(),
		SenderJID:        evt.Info.Sender.String(),
		SenderPushName:   evt.Info.PushName,
		MessageTimestamp: evt.Info.Timestamp,
		IsFromMe:         evt.Info.IsFromMe,
		IsBroadcast:      evt.Info.IsIncomingBroadcast(),
		Source:           ParsedMessageSourceRealtime,
	}

	// Parse message content based on type
	p.parseMessageContent(msg, evt.Message)

	// Store raw payload
	if rawBytes, err := json.Marshal(evt.Message); err == nil {
		msg.RawPayload = rawBytes
	}

	return msg, nil
}

// ParseHistoryMessage parses a message from history sync
func (p *MessageParser) ParseHistoryMessage(sessionID string, chatJID string, historyMsg *waE2E.Message, info *types.MessageInfo) (*ParsedMessage, error) {
	msg := &ParsedMessage{
		SessionID: sessionID,
		ChatJID:   chatJID,
		Source:    ParsedMessageSourceHistory,
	}

	// Set message info if available
	if info != nil {
		msg.MessageID = info.ID
		msg.SenderJID = info.Sender.String()
		msg.SenderPushName = info.PushName
		msg.MessageTimestamp = info.Timestamp
		msg.IsFromMe = info.IsFromMe
		msg.IsBroadcast = info.IsIncomingBroadcast()
	}

	// Parse message content
	p.parseMessageContent(msg, historyMsg)

	// Store raw payload
	if rawBytes, err := json.Marshal(historyMsg); err == nil {
		msg.RawPayload = rawBytes
	}

	return msg, nil
}

// parseMessageContent extracts content from a WhatsApp message based on its type
func (p *MessageParser) parseMessageContent(msg *ParsedMessage, waMsg *waE2E.Message) {
	if waMsg == nil {
		msg.MessageType = ParsedMessageTypeUnknown
		return
	}

	// Detect message type and extract content
	switch {
	case waMsg.GetConversation() != "":
		msg.MessageType = ParsedMessageTypeText
		text := waMsg.GetConversation()
		msg.Text = &text

	case waMsg.GetExtendedTextMessage() != nil:
		msg.MessageType = ParsedMessageTypeText
		text := waMsg.GetExtendedTextMessage().GetText()
		msg.Text = &text
		// Check context info for replies
		if ctx := waMsg.GetExtendedTextMessage().GetContextInfo(); ctx != nil {
			if ctx.GetStanzaID() != "" {
				quotedID := ctx.GetStanzaID()
				msg.QuotedMessageID = &quotedID
			}
			msg.IsForwarded = ctx.GetIsForwarded()
		}

	case waMsg.GetImageMessage() != nil:
		p.parseImageMessage(msg, waMsg.GetImageMessage())

	case waMsg.GetVideoMessage() != nil:
		p.parseVideoMessage(msg, waMsg.GetVideoMessage())

	case waMsg.GetAudioMessage() != nil:
		p.parseAudioMessage(msg, waMsg.GetAudioMessage())

	case waMsg.GetDocumentMessage() != nil:
		p.parseDocumentMessage(msg, waMsg.GetDocumentMessage())

	case waMsg.GetStickerMessage() != nil:
		p.parseStickerMessage(msg, waMsg.GetStickerMessage())

	case waMsg.GetLocationMessage() != nil:
		p.parseLocationMessage(msg, waMsg.GetLocationMessage())

	case waMsg.GetContactMessage() != nil:
		p.parseContactMessage(msg, waMsg.GetContactMessage())

	case waMsg.GetPollCreationMessage() != nil:
		p.parsePollMessage(msg, waMsg.GetPollCreationMessage())

	case waMsg.GetReactionMessage() != nil:
		p.parseReactionMessage(msg, waMsg.GetReactionMessage())

	case waMsg.GetProtocolMessage() != nil:
		msg.MessageType = ParsedMessageTypeProtocol

	case waMsg.GetViewOnceMessage() != nil:
		msg.IsViewOnce = true
		// Parse the inner message
		if inner := waMsg.GetViewOnceMessage().GetMessage(); inner != nil {
			p.parseMessageContent(msg, inner)
		}

	case waMsg.GetViewOnceMessageV2() != nil:
		msg.IsViewOnce = true
		if inner := waMsg.GetViewOnceMessageV2().GetMessage(); inner != nil {
			p.parseMessageContent(msg, inner)
		}

	default:
		msg.MessageType = ParsedMessageTypeUnknown
	}
}

func (p *MessageParser) parseImageMessage(msg *ParsedMessage, imgMsg *waE2E.ImageMessage) {
	msg.MessageType = ParsedMessageTypeImage

	if imgMsg.GetCaption() != "" {
		caption := imgMsg.GetCaption()
		msg.Caption = &caption
	}

	if imgMsg.GetURL() != "" {
		url := imgMsg.GetURL()
		msg.MediaURL = &url
	}

	if imgMsg.GetMimetype() != "" {
		mimetype := imgMsg.GetMimetype()
		msg.Mimetype = &mimetype
	}

	if len(imgMsg.GetMediaKey()) > 0 {
		msg.MediaKey = imgMsg.GetMediaKey()
	}

	if len(imgMsg.GetFileSHA256()) > 0 {
		msg.MediaSHA256 = imgMsg.GetFileSHA256()
	}

	if imgMsg.GetFileLength() > 0 {
		size := imgMsg.GetFileLength()
		msg.MediaSize = &size
	}

	// Check context info
	if ctx := imgMsg.GetContextInfo(); ctx != nil {
		if ctx.GetStanzaID() != "" {
			quotedID := ctx.GetStanzaID()
			msg.QuotedMessageID = &quotedID
		}
		msg.IsForwarded = ctx.GetIsForwarded()
	}
}

func (p *MessageParser) parseVideoMessage(msg *ParsedMessage, vidMsg *waE2E.VideoMessage) {
	msg.MessageType = ParsedMessageTypeVideo

	if vidMsg.GetCaption() != "" {
		caption := vidMsg.GetCaption()
		msg.Caption = &caption
	}

	if vidMsg.GetURL() != "" {
		url := vidMsg.GetURL()
		msg.MediaURL = &url
	}

	if vidMsg.GetMimetype() != "" {
		mimetype := vidMsg.GetMimetype()
		msg.Mimetype = &mimetype
	}

	if len(vidMsg.GetMediaKey()) > 0 {
		msg.MediaKey = vidMsg.GetMediaKey()
	}

	if len(vidMsg.GetFileSHA256()) > 0 {
		msg.MediaSHA256 = vidMsg.GetFileSHA256()
	}

	if vidMsg.GetFileLength() > 0 {
		size := vidMsg.GetFileLength()
		msg.MediaSize = &size
	}

	// Check context info
	if ctx := vidMsg.GetContextInfo(); ctx != nil {
		if ctx.GetStanzaID() != "" {
			quotedID := ctx.GetStanzaID()
			msg.QuotedMessageID = &quotedID
		}
		msg.IsForwarded = ctx.GetIsForwarded()
	}
}

func (p *MessageParser) parseAudioMessage(msg *ParsedMessage, audMsg *waE2E.AudioMessage) {
	msg.MessageType = ParsedMessageTypeAudio

	if audMsg.GetURL() != "" {
		url := audMsg.GetURL()
		msg.MediaURL = &url
	}

	if audMsg.GetMimetype() != "" {
		mimetype := audMsg.GetMimetype()
		msg.Mimetype = &mimetype
	}

	if len(audMsg.GetMediaKey()) > 0 {
		msg.MediaKey = audMsg.GetMediaKey()
	}

	if len(audMsg.GetFileSHA256()) > 0 {
		msg.MediaSHA256 = audMsg.GetFileSHA256()
	}

	if audMsg.GetFileLength() > 0 {
		size := audMsg.GetFileLength()
		msg.MediaSize = &size
	}

	// Check context info
	if ctx := audMsg.GetContextInfo(); ctx != nil {
		if ctx.GetStanzaID() != "" {
			quotedID := ctx.GetStanzaID()
			msg.QuotedMessageID = &quotedID
		}
		msg.IsForwarded = ctx.GetIsForwarded()
	}
}

func (p *MessageParser) parseDocumentMessage(msg *ParsedMessage, docMsg *waE2E.DocumentMessage) {
	msg.MessageType = ParsedMessageTypeDocument

	if docMsg.GetFileName() != "" {
		filename := docMsg.GetFileName()
		msg.Filename = &filename
	}

	if docMsg.GetCaption() != "" {
		caption := docMsg.GetCaption()
		msg.Caption = &caption
	}

	if docMsg.GetURL() != "" {
		url := docMsg.GetURL()
		msg.MediaURL = &url
	}

	if docMsg.GetMimetype() != "" {
		mimetype := docMsg.GetMimetype()
		msg.Mimetype = &mimetype
	}

	if len(docMsg.GetMediaKey()) > 0 {
		msg.MediaKey = docMsg.GetMediaKey()
	}

	if len(docMsg.GetFileSHA256()) > 0 {
		msg.MediaSHA256 = docMsg.GetFileSHA256()
	}

	if docMsg.GetFileLength() > 0 {
		size := docMsg.GetFileLength()
		msg.MediaSize = &size
	}

	// Check context info
	if ctx := docMsg.GetContextInfo(); ctx != nil {
		if ctx.GetStanzaID() != "" {
			quotedID := ctx.GetStanzaID()
			msg.QuotedMessageID = &quotedID
		}
		msg.IsForwarded = ctx.GetIsForwarded()
	}
}

func (p *MessageParser) parseStickerMessage(msg *ParsedMessage, stkMsg *waE2E.StickerMessage) {
	msg.MessageType = ParsedMessageTypeSticker

	if stkMsg.GetURL() != "" {
		url := stkMsg.GetURL()
		msg.MediaURL = &url
	}

	if stkMsg.GetMimetype() != "" {
		mimetype := stkMsg.GetMimetype()
		msg.Mimetype = &mimetype
	}

	if len(stkMsg.GetMediaKey()) > 0 {
		msg.MediaKey = stkMsg.GetMediaKey()
	}

	if len(stkMsg.GetFileSHA256()) > 0 {
		msg.MediaSHA256 = stkMsg.GetFileSHA256()
	}

	if stkMsg.GetFileLength() > 0 {
		size := stkMsg.GetFileLength()
		msg.MediaSize = &size
	}

	// Check context info
	if ctx := stkMsg.GetContextInfo(); ctx != nil {
		if ctx.GetStanzaID() != "" {
			quotedID := ctx.GetStanzaID()
			msg.QuotedMessageID = &quotedID
		}
		msg.IsForwarded = ctx.GetIsForwarded()
	}
}

func (p *MessageParser) parseLocationMessage(msg *ParsedMessage, locMsg *waE2E.LocationMessage) {
	msg.MessageType = ParsedMessageTypeLocation

	lat := locMsg.GetDegreesLatitude()
	msg.Latitude = &lat

	lng := locMsg.GetDegreesLongitude()
	msg.Longitude = &lng

	if locMsg.GetName() != "" {
		name := locMsg.GetName()
		msg.Text = &name
	}

	if locMsg.GetAddress() != "" {
		addr := locMsg.GetAddress()
		msg.Address = &addr
	}

	// Check context info
	if ctx := locMsg.GetContextInfo(); ctx != nil {
		if ctx.GetStanzaID() != "" {
			quotedID := ctx.GetStanzaID()
			msg.QuotedMessageID = &quotedID
		}
		msg.IsForwarded = ctx.GetIsForwarded()
	}
}

func (p *MessageParser) parseContactMessage(msg *ParsedMessage, ctcMsg *waE2E.ContactMessage) {
	msg.MessageType = ParsedMessageTypeContact

	if ctcMsg.GetDisplayName() != "" {
		name := ctcMsg.GetDisplayName()
		msg.Text = &name
	}

	if ctcMsg.GetVcard() != "" {
		vcard := ctcMsg.GetVcard()
		msg.VCard = &vcard
	}

	// Check context info
	if ctx := ctcMsg.GetContextInfo(); ctx != nil {
		if ctx.GetStanzaID() != "" {
			quotedID := ctx.GetStanzaID()
			msg.QuotedMessageID = &quotedID
		}
		msg.IsForwarded = ctx.GetIsForwarded()
	}
}

func (p *MessageParser) parsePollMessage(msg *ParsedMessage, pollMsg *waE2E.PollCreationMessage) {
	msg.MessageType = ParsedMessageTypePoll

	if pollMsg.GetName() != "" {
		name := pollMsg.GetName()
		msg.PollName = &name
		msg.Text = &name
	}

	options := make([]string, 0, len(pollMsg.GetOptions()))
	for _, opt := range pollMsg.GetOptions() {
		if opt.GetOptionName() != "" {
			options = append(options, opt.GetOptionName())
		}
	}
	msg.PollOptions = options

	// Check context info
	if ctx := pollMsg.GetContextInfo(); ctx != nil {
		if ctx.GetStanzaID() != "" {
			quotedID := ctx.GetStanzaID()
			msg.QuotedMessageID = &quotedID
		}
		msg.IsForwarded = ctx.GetIsForwarded()
	}
}

func (p *MessageParser) parseReactionMessage(msg *ParsedMessage, reactMsg *waE2E.ReactionMessage) {
	msg.MessageType = ParsedMessageTypeReaction

	if reactMsg.GetText() != "" {
		emoji := reactMsg.GetText()
		msg.ReactionEmoji = &emoji
		msg.Text = &emoji
	}

	if reactMsg.GetKey() != nil && reactMsg.GetKey().GetID() != "" {
		targetID := reactMsg.GetKey().GetID()
		msg.ReactionMessageID = &targetID
	}
}

// IsGroupMessage returns true if the message is from a group chat
func (pm *ParsedMessage) IsGroupMessage() bool {
	// Group JIDs end with @g.us
	return len(pm.ChatJID) > 5 && pm.ChatJID[len(pm.ChatJID)-5:] == "@g.us"
}

// HasTextContent returns true if the message has text content for AI processing
func (pm *ParsedMessage) HasTextContent() bool {
	return (pm.Text != nil && *pm.Text != "") || (pm.Caption != nil && *pm.Caption != "")
}

// GetTextContent returns the text content of the message (text or caption)
func (pm *ParsedMessage) GetTextContent() string {
	if pm.Text != nil && *pm.Text != "" {
		return *pm.Text
	}
	if pm.Caption != nil && *pm.Caption != "" {
		return *pm.Caption
	}
	return ""
}
