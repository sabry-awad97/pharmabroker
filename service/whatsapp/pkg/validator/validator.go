package validator

import (
	"regexp"
	"sync"

	"github.com/go-playground/validator/v10"
)

var (
	validate *validator.Validate
	once     sync.Once
)

// e164Regex validates E.164 phone number format
var e164Regex = regexp.MustCompile(`^\+[1-9]\d{1,14}$`)

// GetValidator returns the singleton validator instance
func GetValidator() *validator.Validate {
	once.Do(func() {
		validate = validator.New()
		// Register custom e164 validation
		_ = validate.RegisterValidation("e164", validateE164)
	})
	return validate
}

// validateE164 validates E.164 phone number format
func validateE164(fl validator.FieldLevel) bool {
	return e164Regex.MatchString(fl.Field().String())
}

// Validate validates a struct using the singleton validator
func Validate(s interface{}) error {
	return GetValidator().Struct(s)
}

// ValidationErrors extracts validation errors as a map
func ValidationErrors(err error) map[string]string {
	if err == nil {
		return nil
	}

	validationErrors, ok := err.(validator.ValidationErrors)
	if !ok {
		return map[string]string{"error": err.Error()}
	}

	errors := make(map[string]string)
	for _, e := range validationErrors {
		errors[e.Field()] = formatValidationError(e)
	}
	return errors
}

// formatValidationError formats a single validation error
func formatValidationError(e validator.FieldError) string {
	switch e.Tag() {
	case "required":
		return "this field is required"
	case "min":
		return "value is too short"
	case "max":
		return "value is too long"
	case "uuid":
		return "must be a valid UUID"
	case "e164":
		return "must be a valid E.164 phone number"
	case "url":
		return "must be a valid URL"
	case "oneof":
		return "must be one of the allowed values"
	case "required_if":
		return "this field is required based on other field values"
	default:
		return "validation failed"
	}
}
