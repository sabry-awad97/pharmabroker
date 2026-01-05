package property

import (
	"fmt"
	"strings"
	"testing"

	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
	"github.com/pharmabroker/whatsapp/internal/domain/errors"
	"github.com/pharmabroker/whatsapp/internal/domain/valueobject"
)

// Feature: whatsapp-service, Property 7: E.164 Phone Number Validation
// *For any* string input, the phone number validator should accept valid E.164 format numbers
// and reject all invalid formats.
// **Validates: Requirements 4.3**

func TestPhoneNumberValidation_Property7(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property 7.1: Valid E.164 numbers should always be accepted
	// E.164 format: + followed by 1-15 digits, starting with non-zero digit
	properties.Property("valid E.164 numbers are accepted", prop.ForAll(
		func(countryCode int, subscriberLen int) bool {
			// Build a valid E.164 number
			subscriber := strings.Repeat("5", subscriberLen)
			number := fmt.Sprintf("+%d%s", countryCode, subscriber)

			// Ensure total length is valid (1-15 digits after +)
			digits := number[1:] // remove +
			if len(digits) < 1 || len(digits) > 15 {
				return true // skip invalid test cases
			}

			pn, err := valueobject.NewPhoneNumber(number)
			if err != nil {
				t.Logf("Expected valid number %s to be accepted, got error: %v", number, err)
				return false
			}

			// The created phone number should equal the input
			return pn.String() == number
		},
		gen.IntRange(1, 999), // country code 1-999
		gen.IntRange(1, 12),  // subscriber number length
	))

	// Property 7.2: Numbers without + prefix should be rejected
	properties.Property("numbers without + prefix are rejected", prop.ForAll(
		func(digitLen int) bool {
			// Generate a number without + prefix
			digits := strings.Repeat("1", digitLen+1)

			_, err := valueobject.NewPhoneNumber(digits)
			return errors.IsDomainError(err) && errors.GetDomainError(err).Code == "INVALID_PHONE"
		},
		gen.IntRange(1, 15),
	))

	// Property 7.3: Numbers starting with +0 should be rejected
	properties.Property("numbers starting with +0 are rejected", prop.ForAll(
		func(digitLen int) bool {
			digits := strings.Repeat("1", digitLen)
			number := "+0" + digits
			_, err := valueobject.NewPhoneNumber(number)
			return errors.IsDomainError(err) && errors.GetDomainError(err).Code == "INVALID_PHONE"
		},
		gen.IntRange(1, 13),
	))

	// Property 7.4: Numbers with non-digit characters (after +) should be rejected
	properties.Property("numbers with non-digit characters are rejected", prop.ForAll(
		func(prefix int, nonDigitCode int, suffix int) bool {
			// Convert nonDigitCode to a non-digit character
			// Use ASCII codes that are not digits (0-9 are 48-57)
			var nonDigit rune
			if nonDigitCode < 48 {
				nonDigit = rune(nonDigitCode + 32) // space to /
			} else {
				nonDigit = rune(nonDigitCode + 10 + 48) // : onwards
			}

			// Skip if somehow we got a digit
			if nonDigit >= '0' && nonDigit <= '9' {
				return true
			}

			prefixStr := fmt.Sprintf("%d", prefix)
			suffixStr := fmt.Sprintf("%d", suffix)
			number := "+" + prefixStr + string(nonDigit) + suffixStr

			_, err := valueobject.NewPhoneNumber(number)
			return err != nil
		},
		gen.IntRange(1, 999),
		gen.IntRange(0, 15), // will be mapped to non-digit chars
		gen.IntRange(0, 999),
	))

	// Property 7.5: Numbers longer than 15 digits should be rejected
	properties.Property("numbers longer than 15 digits are rejected", prop.ForAll(
		func(extraDigits int) bool {
			// Create a number with more than 15 digits
			digits := strings.Repeat("1", 16+extraDigits)
			number := "+" + digits
			_, err := valueobject.NewPhoneNumber(number)
			return errors.IsDomainError(err) && errors.GetDomainError(err).Code == "INVALID_PHONE"
		},
		gen.IntRange(0, 10),
	))

	// Property 7.6: Empty string should be rejected
	properties.Property("empty string is rejected", prop.ForAll(
		func(_ int) bool {
			_, err := valueobject.NewPhoneNumber("")
			return errors.IsDomainError(err) && errors.GetDomainError(err).Code == "INVALID_PHONE"
		},
		gen.Const(0),
	))

	// Property 7.7: Whitespace-only strings should be rejected
	properties.Property("whitespace-only strings are rejected", prop.ForAll(
		func(spaces int) bool {
			whitespace := strings.Repeat(" ", spaces+1)
			_, err := valueobject.NewPhoneNumber(whitespace)
			return errors.IsDomainError(err) && errors.GetDomainError(err).Code == "INVALID_PHONE"
		},
		gen.IntRange(0, 10),
	))

	// Property 7.8: Valid numbers with leading/trailing whitespace should be accepted after trimming
	properties.Property("valid numbers with whitespace are accepted after trimming", prop.ForAll(
		func(leadingSpaces, trailingSpaces int) bool {
			validNumber := "+14155551234"
			input := strings.Repeat(" ", leadingSpaces) + validNumber + strings.Repeat(" ", trailingSpaces)

			pn, err := valueobject.NewPhoneNumber(input)
			if err != nil {
				return false
			}

			return pn.String() == validNumber
		},
		gen.IntRange(0, 5),
		gen.IntRange(0, 5),
	))

	// Property 7.9: Round-trip - valid phone numbers maintain their value
	properties.Property("valid phone numbers maintain their value through round-trip", prop.ForAll(
		func(countryCode int, subscriberLen int) bool {
			// Build a valid E.164 number
			subscriber := strings.Repeat("5", subscriberLen)
			number := fmt.Sprintf("+%d%s", countryCode, subscriber)

			// Ensure total length is valid (1-15 digits after +)
			digits := number[1:]
			if len(digits) < 1 || len(digits) > 15 {
				return true // skip invalid test cases
			}

			pn, err := valueobject.NewPhoneNumber(number)
			if err != nil {
				return false
			}

			// Round-trip: String() should return the original value
			return pn.String() == number && pn.IsValid()
		},
		gen.IntRange(1, 999),
		gen.IntRange(1, 12),
	))

	properties.TestingRun(t)
}
