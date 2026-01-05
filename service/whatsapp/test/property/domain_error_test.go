package property

import (
	stderrors "errors"
	"fmt"
	"testing"

	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
	"github.com/pharmabroker/whatsapp/internal/domain/errors"
)

// Feature: whatsapp-service, Property 14: Domain Error Type Preservation
// *For any* domain-specific error, it should be wrapped in a custom error type
// that preserves the error code and context.
// **Validates: Requirements 9.3**

func TestDomainErrorTypePreservation_Property14(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property 14.1: DomainError preserves code and message
	properties.Property("DomainError preserves code and message", prop.ForAll(
		func(code, message string) bool {
			if code == "" || message == "" {
				return true // skip empty inputs
			}

			err := errors.NewDomainError(code, message)

			return err.GetCode() == code && err.GetMessage() == message
		},
		gen.AlphaString(),
		gen.AlphaString(),
	))

	// Property 14.2: DomainError.Error() contains code and message
	properties.Property("DomainError.Error() contains code and message", prop.ForAll(
		func(code, message string) bool {
			if code == "" || message == "" {
				return true // skip empty inputs
			}

			err := errors.NewDomainError(code, message)
			errorStr := err.Error()

			return contains(errorStr, code) && contains(errorStr, message)
		},
		gen.AlphaString(),
		gen.AlphaString(),
	))

	// Property 14.3: WithCause preserves original code and message while adding cause
	properties.Property("WithCause preserves code and message while adding cause", prop.ForAll(
		func(code, message, causeMsg string) bool {
			if code == "" || message == "" || causeMsg == "" {
				return true // skip empty inputs
			}

			original := errors.NewDomainError(code, message)
			cause := fmt.Errorf("%s", causeMsg)
			wrapped := original.WithCause(cause)

			// Code and message should be preserved
			codePreserved := wrapped.GetCode() == code
			messagePreserved := wrapped.GetMessage() == message

			// Cause should be accessible via Unwrap
			unwrapped := wrapped.Unwrap()
			causePreserved := unwrapped != nil && unwrapped.Error() == causeMsg

			// Error string should contain cause
			errorStr := wrapped.Error()
			causeInError := contains(errorStr, causeMsg)

			return codePreserved && messagePreserved && causePreserved && causeInError
		},
		gen.AlphaString(),
		gen.AlphaString(),
		gen.AlphaString(),
	))

	// Property 14.4: WithMessage preserves code while changing message
	properties.Property("WithMessage preserves code while changing message", prop.ForAll(
		func(code, originalMsg, newMsg string) bool {
			if code == "" || originalMsg == "" || newMsg == "" {
				return true // skip empty inputs
			}

			original := errors.NewDomainError(code, originalMsg)
			modified := original.WithMessage(newMsg)

			// Code should be preserved
			codePreserved := modified.GetCode() == code

			// Message should be changed
			messageChanged := modified.GetMessage() == newMsg

			return codePreserved && messageChanged
		},
		gen.AlphaString(),
		gen.AlphaString(),
		gen.AlphaString(),
	))

	// Property 14.5: errors.Is works correctly for DomainError comparison by code
	properties.Property("errors.Is compares DomainErrors by code", prop.ForAll(
		func(code, msg1, msg2 string) bool {
			if code == "" || msg1 == "" || msg2 == "" {
				return true // skip empty inputs
			}

			err1 := errors.NewDomainError(code, msg1)
			err2 := errors.NewDomainError(code, msg2)

			// Same code should match
			return stderrors.Is(err1, err2)
		},
		gen.AlphaString(),
		gen.AlphaString(),
		gen.AlphaString(),
	))

	// Property 14.6: errors.Is returns false for different codes
	properties.Property("errors.Is returns false for different codes", prop.ForAll(
		func(code1, code2, msg string) bool {
			if code1 == "" || code2 == "" || msg == "" || code1 == code2 {
				return true // skip empty inputs or same codes
			}

			err1 := errors.NewDomainError(code1, msg)
			err2 := errors.NewDomainError(code2, msg)

			// Different codes should not match
			return !stderrors.Is(err1, err2)
		},
		gen.AlphaString(),
		gen.AlphaString(),
		gen.AlphaString(),
	))

	// Property 14.7: IsDomainError correctly identifies DomainErrors
	properties.Property("IsDomainError correctly identifies DomainErrors", prop.ForAll(
		func(code, message string) bool {
			if code == "" || message == "" {
				return true // skip empty inputs
			}

			domainErr := errors.NewDomainError(code, message)
			regularErr := fmt.Errorf("regular error")

			// DomainError should be identified
			isDomain := errors.IsDomainError(domainErr)

			// Regular error should not be identified as DomainError
			isNotDomain := !errors.IsDomainError(regularErr)

			return isDomain && isNotDomain
		},
		gen.AlphaString(),
		gen.AlphaString(),
	))

	// Property 14.8: GetDomainError extracts DomainError from error chain
	properties.Property("GetDomainError extracts DomainError from error chain", prop.ForAll(
		func(code, message, wrapMsg string) bool {
			if code == "" || message == "" || wrapMsg == "" {
				return true // skip empty inputs
			}

			domainErr := errors.NewDomainError(code, message)
			wrapped := fmt.Errorf("%s: %w", wrapMsg, domainErr)

			extracted := errors.GetDomainError(wrapped)

			// Should extract the original DomainError
			return extracted != nil && extracted.GetCode() == code && extracted.GetMessage() == message
		},
		gen.AlphaString(),
		gen.AlphaString(),
		gen.AlphaString(),
	))

	// Property 14.9: Predefined errors have unique codes
	properties.Property("predefined errors have consistent codes", prop.ForAll(
		func(_ int) bool {
			// Test that predefined errors maintain their codes
			predefinedErrors := map[string]*errors.DomainError{
				"SESSION_NOT_FOUND":   errors.ErrSessionNotFound,
				"SESSION_EXISTS":      errors.ErrSessionExists,
				"INVALID_PHONE":       errors.ErrInvalidPhoneNumber,
				"MESSAGE_SEND_FAILED": errors.ErrMessageSendFailed,
				"QR_TIMEOUT":          errors.ErrQRTimeout,
				"CONNECTION_FAILED":   errors.ErrConnectionFailed,
				"VALIDATION_FAILED":   errors.ErrValidationFailed,
				"CONFIG_MISSING":      errors.ErrConfigMissing,
				"DATABASE_ERROR":      errors.ErrDatabaseError,
				"INTERNAL_ERROR":      errors.ErrInternal,
			}

			for expectedCode, err := range predefinedErrors {
				if err.GetCode() != expectedCode {
					return false
				}
			}

			return true
		},
		gen.Const(0),
	))

	properties.TestingRun(t)
}

// contains checks if s contains substr
func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(substr) == 0 ||
		(len(s) > 0 && len(substr) > 0 && findSubstring(s, substr)))
}

func findSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
