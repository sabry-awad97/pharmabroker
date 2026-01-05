package property

import (
	"fmt"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
	"github.com/pharmabroker/whatsapp/internal/application/dto"
	"github.com/pharmabroker/whatsapp/pkg/validator"
)

// Feature: whatsapp-service, Property 1: DTO Validation Consistency
// *For any* DTO with validation tags, validation should pass for all valid inputs
// and fail with descriptive errors for all invalid inputs.
// **Validates: Requirements 1.4, 9.2, 9.4**

func TestDTOValidationConsistency_Property1(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property 1.1: CreateSessionRequest with valid name passes validation
	properties.Property("CreateSessionRequest with valid name passes validation", prop.ForAll(
		func(nameLen int) bool {
			// Generate a valid name (1-100 characters)
			name := strings.Repeat("a", nameLen)
			req := dto.CreateSessionRequest{Name: name}

			err := validator.Validate(req)
			return err == nil
		},
		gen.IntRange(1, 100),
	))

	// Property 1.2: CreateSessionRequest with empty name fails validation
	properties.Property("CreateSessionRequest with empty name fails validation", prop.ForAll(
		func(_ int) bool {
			req := dto.CreateSessionRequest{Name: ""}
			err := validator.Validate(req)
			return err != nil
		},
		gen.Const(0),
	))

	// Property 1.3: CreateSessionRequest with name > 100 chars fails validation
	properties.Property("CreateSessionRequest with name > 100 chars fails validation", prop.ForAll(
		func(extraLen int) bool {
			name := strings.Repeat("a", 101+extraLen)
			req := dto.CreateSessionRequest{Name: name}
			err := validator.Validate(req)
			return err != nil
		},
		gen.IntRange(0, 50),
	))

	// Property 1.4: SendMessageRequest with valid text message passes validation
	properties.Property("SendMessageRequest with valid text message passes validation", prop.ForAll(
		func(textLen int, countryCode int, subscriberLen int) bool {
			// Generate valid UUID
			sessionID := uuid.New().String()

			// Generate valid E.164 phone number
			subscriber := strings.Repeat("5", subscriberLen)
			phone := fmt.Sprintf("+%d%s", countryCode, subscriber)

			// Ensure phone is valid E.164 (1-15 digits after +)
			digits := phone[1:]
			if len(digits) < 1 || len(digits) > 15 {
				return true // skip invalid test cases
			}

			// Generate text content
			text := strings.Repeat("x", textLen)

			req := dto.SendMessageRequest{
				SessionID: sessionID,
				To:        phone,
				Type:      "text",
				Content: dto.SendMessageContentInput{
					Text: &text,
				},
			}

			err := validator.Validate(req)
			return err == nil
		},
		gen.IntRange(1, 100),
		gen.IntRange(1, 999),
		gen.IntRange(1, 12),
	))

	// Property 1.5: SendMessageRequest with invalid UUID fails validation
	properties.Property("SendMessageRequest with invalid UUID fails validation", prop.ForAll(
		func(invalidID string) bool {
			if invalidID == "" {
				return true // skip empty
			}

			text := "test message"
			req := dto.SendMessageRequest{
				SessionID: invalidID,
				To:        "+14155551234",
				Type:      "text",
				Content: dto.SendMessageContentInput{
					Text: &text,
				},
			}

			err := validator.Validate(req)
			return err != nil
		},
		gen.AlphaString().SuchThat(func(s string) bool {
			_, err := uuid.Parse(s)
			return err != nil && s != ""
		}),
	))

	// Property 1.6: SendMessageRequest with invalid phone number fails validation
	properties.Property("SendMessageRequest with invalid phone number fails validation", prop.ForAll(
		func(invalidPhone string) bool {
			// Skip if somehow valid
			if strings.HasPrefix(invalidPhone, "+") && len(invalidPhone) > 1 {
				return true
			}

			text := "test message"
			req := dto.SendMessageRequest{
				SessionID: uuid.New().String(),
				To:        invalidPhone,
				Type:      "text",
				Content: dto.SendMessageContentInput{
					Text: &text,
				},
			}

			err := validator.Validate(req)
			return err != nil
		},
		gen.AlphaString(),
	))

	// Property 1.7: SendMessageRequest with invalid message type fails validation
	properties.Property("SendMessageRequest with invalid message type fails validation", prop.ForAll(
		func(invalidType string) bool {
			// Skip valid types
			if invalidType == "text" || invalidType == "image" || invalidType == "document" {
				return true
			}

			text := "test message"
			req := dto.SendMessageRequest{
				SessionID: uuid.New().String(),
				To:        "+14155551234",
				Type:      invalidType,
				Content: dto.SendMessageContentInput{
					Text: &text,
				},
			}

			err := validator.Validate(req)
			return err != nil
		},
		gen.AlphaString(),
	))

	// Property 1.8: SendMessageRequest text content > 4096 chars fails validation
	properties.Property("SendMessageRequest text content > 4096 chars fails validation", prop.ForAll(
		func(extraLen int) bool {
			text := strings.Repeat("x", 4097+extraLen)
			req := dto.SendMessageRequest{
				SessionID: uuid.New().String(),
				To:        "+14155551234",
				Type:      "text",
				Content: dto.SendMessageContentInput{
					Text: &text,
				},
			}

			err := validator.Validate(req)
			return err != nil
		},
		gen.IntRange(0, 100),
	))

	// Property 1.9: SendMessageRequest caption > 1024 chars fails validation
	properties.Property("SendMessageRequest caption > 1024 chars fails validation", prop.ForAll(
		func(extraLen int) bool {
			imageURL := "https://example.com/image.png"
			caption := strings.Repeat("c", 1025+extraLen)
			req := dto.SendMessageRequest{
				SessionID: uuid.New().String(),
				To:        "+14155551234",
				Type:      "image",
				Content: dto.SendMessageContentInput{
					ImageURL: &imageURL,
					Caption:  &caption,
				},
			}

			err := validator.Validate(req)
			return err != nil
		},
		gen.IntRange(0, 100),
	))

	// Property 1.10: APIResponse success structure is consistent
	properties.Property("APIResponse success structure is consistent", prop.ForAll(
		func(data string) bool {
			resp := dto.NewSuccessResponse(data)

			// Success response should have Success=true and no Error
			return resp.Success && resp.Error == nil && resp.Data == data
		},
		gen.AlphaString(),
	))

	// Property 1.11: APIResponse error structure is consistent
	properties.Property("APIResponse error structure is consistent", prop.ForAll(
		func(code, message string) bool {
			if code == "" || message == "" {
				return true // skip empty
			}

			resp := dto.NewErrorResponse[string](code, message, nil)

			// Error response should have Success=false and Error populated
			return !resp.Success && resp.Error != nil &&
				resp.Error.Code == code && resp.Error.Message == message
		},
		gen.AlphaString(),
		gen.AlphaString(),
	))

	// Property 1.12: ValidationErrors returns descriptive error map
	properties.Property("ValidationErrors returns descriptive error map", prop.ForAll(
		func(_ int) bool {
			// Create an invalid request
			req := dto.CreateSessionRequest{Name: ""}
			err := validator.Validate(req)

			if err == nil {
				return false
			}

			errors := validator.ValidationErrors(err)
			// Should have at least one error
			return len(errors) > 0
		},
		gen.Const(0),
	))

	properties.TestingRun(t)
}
