package dto

import (
	"errors"
)

// DTO validation errors
var (
	ErrTextRequired     = errors.New("text content is required for text messages")
	ErrImageURLRequired = errors.New("image_url is required for image messages")
	ErrDocURLRequired   = errors.New("doc_url is required for document messages")
	ErrAudioURLRequired = errors.New("audio_url is required for audio messages")
	ErrVideoURLRequired = errors.New("video_url is required for video messages")
)
