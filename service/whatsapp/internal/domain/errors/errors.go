package errors

import (
	"errors"
	"fmt"
)

// DomainError represents a domain-specific error with code and message
type DomainError struct {
	Code    string
	Message string
	Cause   error
}

// Error implements the error interface
func (e *DomainError) Error() string {
	if e.Cause != nil {
		return fmt.Sprintf("%s: %s (caused by: %v)", e.Code, e.Message, e.Cause)
	}
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

// Unwrap returns the underlying cause
func (e *DomainError) Unwrap() error {
	return e.Cause
}

// Is implements errors.Is for DomainError comparison
func (e *DomainError) Is(target error) bool {
	t, ok := target.(*DomainError)
	if !ok {
		return false
	}
	return e.Code == t.Code
}

// NewDomainError creates a new DomainError
func NewDomainError(code, message string) *DomainError {
	return &DomainError{
		Code:    code,
		Message: message,
	}
}

// WithCause returns a new DomainError with the given cause
func (e *DomainError) WithCause(cause error) *DomainError {
	return &DomainError{
		Code:    e.Code,
		Message: e.Message,
		Cause:   cause,
	}
}

// WithMessage returns a new DomainError with a custom message
func (e *DomainError) WithMessage(message string) *DomainError {
	return &DomainError{
		Code:    e.Code,
		Message: message,
		Cause:   e.Cause,
	}
}

// GetCode returns the error code
func (e *DomainError) GetCode() string {
	return e.Code
}

// GetMessage returns the error message
func (e *DomainError) GetMessage() string {
	return e.Message
}

// IsDomainError checks if an error is a DomainError
func IsDomainError(err error) bool {
	var domainErr *DomainError
	return errors.As(err, &domainErr)
}

// GetDomainError extracts a DomainError from an error chain
func GetDomainError(err error) *DomainError {
	var domainErr *DomainError
	if errors.As(err, &domainErr) {
		return domainErr
	}
	return nil
}

// IsNotFound checks if an error is a not found error
func IsNotFound(err error) bool {
	domainErr := GetDomainError(err)
	if domainErr == nil {
		return false
	}
	return domainErr.Code == "SESSION_NOT_FOUND" || domainErr.Code == "NOT_FOUND" || domainErr.Code == "MESSAGE_NOT_FOUND"
}

// Pre-defined domain errors
var (
	// Session errors
	ErrSessionNotFound = NewDomainError("SESSION_NOT_FOUND", "session not found")
	ErrSessionExists   = NewDomainError("SESSION_EXISTS", "session already exists")
	ErrSessionInvalid  = NewDomainError("SESSION_INVALID", "session is invalid")

	// Phone number errors
	ErrInvalidPhoneNumber = NewDomainError("INVALID_PHONE", "invalid E.164 phone number")

	// Message errors
	ErrMessageSendFailed  = NewDomainError("MESSAGE_SEND_FAILED", "failed to send message")
	ErrMessageNotFound    = NewDomainError("MESSAGE_NOT_FOUND", "message not found")
	ErrEmptyContent       = NewDomainError("EMPTY_CONTENT", "message content cannot be empty")
	ErrInvalidMessageType = NewDomainError("INVALID_MESSAGE_TYPE", "invalid message type")

	// QR/Authentication errors
	ErrQRTimeout          = NewDomainError("QR_TIMEOUT", "QR authentication timed out")
	ErrQRGenerationFailed = NewDomainError("QR_GENERATION_FAILED", "failed to generate QR code")
	ErrAuthFailed         = NewDomainError("AUTH_FAILED", "authentication failed")

	// Connection errors
	ErrConnectionFailed = NewDomainError("CONNECTION_FAILED", "failed to connect")
	ErrDisconnected     = NewDomainError("DISCONNECTED", "connection disconnected")
	ErrReconnectFailed  = NewDomainError("RECONNECT_FAILED", "failed to reconnect")

	// Validation errors
	ErrValidationFailed = NewDomainError("VALIDATION_FAILED", "validation failed")
	ErrInvalidInput     = NewDomainError("INVALID_INPUT", "invalid input")

	// Configuration errors
	ErrConfigMissing = NewDomainError("CONFIG_MISSING", "required configuration is missing")
	ErrConfigInvalid = NewDomainError("CONFIG_INVALID", "configuration is invalid")

	// Repository errors
	ErrDatabaseError = NewDomainError("DATABASE_ERROR", "database operation failed")
	ErrNotFound      = NewDomainError("NOT_FOUND", "resource not found")
	ErrDuplicate     = NewDomainError("DUPLICATE", "resource already exists")

	// Internal errors
	ErrInternal = NewDomainError("INTERNAL_ERROR", "internal server error")

	// Media errors
	ErrInvalidMediaSize     = NewDomainError("INVALID_MEDIA_SIZE", "invalid media size")
	ErrMediaTooLarge        = NewDomainError("MEDIA_TOO_LARGE", "media file exceeds maximum allowed size")
	ErrUnsupportedMediaType = NewDomainError("UNSUPPORTED_MEDIA_TYPE", "unsupported media type")
	ErrInvalidMimeType      = NewDomainError("INVALID_MIME_TYPE", "invalid or empty MIME type")
	ErrUnsupportedMimeType  = NewDomainError("UNSUPPORTED_MIME_TYPE", "MIME type not supported for this media type")
	ErrMediaDownloadFailed  = NewDomainError("MEDIA_DOWNLOAD_FAILED", "failed to download media from URL")
	ErrMediaUploadFailed    = NewDomainError("MEDIA_UPLOAD_FAILED", "failed to upload media to WhatsApp")

	// Circuit breaker errors
	ErrCircuitOpen = NewDomainError("CIRCUIT_OPEN", "circuit breaker is open, service temporarily unavailable")
)
