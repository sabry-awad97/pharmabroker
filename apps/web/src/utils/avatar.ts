/**
 * Avatar utility functions
 *
 * Provides fallback avatar generation for groups and participants
 * when no avatar image is available.
 */

/**
 * Generates a deterministic avatar URL using DiceBear API.
 * Uses the seed to generate consistent avatars for the same input.
 *
 * @param seed - A unique identifier (name, jid, etc.) to generate avatar from
 * @returns URL to a DiceBear avatar image
 */
export function getAvatarUrl(seed: string): string {
  const encodedSeed = encodeURIComponent(seed);
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodedSeed}&backgroundColor=10b981,14b8a6,06b6d4,0ea5e9&backgroundType=gradientLinear`;
}

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
