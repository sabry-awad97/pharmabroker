package valueobject

import (
	"regexp"
	"strings"

	"github.com/pharmabroker/whatsapp/internal/domain/errors"
)

// E.164 format: + followed by 1-15 digits
// Country code: 1-3 digits
// Subscriber number: remaining digits (total 1-15 digits after +)
var e164Regex = regexp.MustCompile(`^\+[1-9]\d{1,14}$`)

// PhoneNumber is a validated E.164 phone number
type PhoneNumber string

// NewPhoneNumber creates a new PhoneNumber from a string, validating E.164 format
func NewPhoneNumber(number string) (PhoneNumber, error) {
	// Trim whitespace
	number = strings.TrimSpace(number)

	// Validate E.164 format
	if !e164Regex.MatchString(number) {
		return "", errors.ErrInvalidPhoneNumber
	}

	return PhoneNumber(number), nil
}

// MustNewPhoneNumber creates a new PhoneNumber, panicking if invalid
// Use only in tests or when the number is known to be valid
func MustNewPhoneNumber(number string) PhoneNumber {
	pn, err := NewPhoneNumber(number)
	if err != nil {
		panic(err)
	}
	return pn
}

// String returns the string representation of the phone number
func (p PhoneNumber) String() string {
	return string(p)
}

// IsValid checks if the phone number is valid E.164 format
func (p PhoneNumber) IsValid() bool {
	return e164Regex.MatchString(string(p))
}

// CountryCode extracts the country code from the phone number
// Returns empty string if the number is invalid
func (p PhoneNumber) CountryCode() string {
	s := string(p)
	if len(s) < 2 || s[0] != '+' {
		return ""
	}

	// Country codes are 1-3 digits
	// We'll return the first 1-3 digits after the +
	// This is a simplified extraction - real implementation would use a lookup table
	digits := s[1:]
	if len(digits) >= 3 {
		// Check for 3-digit country codes first (e.g., +123)
		// Then 2-digit (e.g., +12)
		// Then 1-digit (e.g., +1)
		// For simplicity, we return up to 3 digits
		return digits[:3]
	}
	return digits
}

// WithoutPlus returns the phone number without the leading +
func (p PhoneNumber) WithoutPlus() string {
	s := string(p)
	if len(s) > 0 && s[0] == '+' {
		return s[1:]
	}
	return s
}

// ValidateE164 validates if a string is a valid E.164 phone number
func ValidateE164(number string) bool {
	return e164Regex.MatchString(strings.TrimSpace(number))
}
