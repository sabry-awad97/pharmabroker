/**
 * Avatar utility functions
 *
 * Provides fallback avatar generation for groups and participants
 * when no avatar image is available.
 */

/**
 * Generates initials from a name for avatar fallback display.
 *
 * Rules:
 * - Single word names: first 2 letters (uppercase)
 * - Multi-word names: first letter of first 2 words (uppercase)
 * - Empty/whitespace names: returns empty string
 *
 * @param name - The name to generate initials from
 * @returns Uppercase initials (1-2 characters) or empty string
 *
 * @example
 * getInitials("John Doe") // "JD"
 * getInitials("Alice") // "AL"
 * getInitials("Marketing Team") // "MT"
 * getInitials("") // ""
 */
export function getInitials(name: string): string {
  const trimmed = name.trim();

  if (!trimmed) {
    return '';
  }

  const words = trimmed.split(/\s+/).filter(Boolean);

  if (words.length === 1) {
    // Single word: take first 2 letters
    return words[0].slice(0, 2).toUpperCase();
  }

  // Multi-word: take first letter of first 2 words
  return (words[0][0] + words[1][0]).toUpperCase();
}
