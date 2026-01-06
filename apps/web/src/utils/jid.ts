/**
 * WhatsApp JID (Jabber ID) utility functions
 *
 * Provides utilities for parsing and extracting information from WhatsApp JIDs.
 * JID formats:
 * - User: "number@s.whatsapp.net"
 * - User with device: "number:device@s.whatsapp.net"
 * - Group: "number@g.us"
 */

/**
 * Extracts the phone number from a WhatsApp JID.
 *
 * Handles the following formats:
 * - "number@s.whatsapp.net" → "number"
 * - "number:device@s.whatsapp.net" → "number"
 * - "number@g.us" → "number"
 *
 * @param jid - The WhatsApp JID to extract the phone number from
 * @returns The phone number portion of the JID, or the original string if parsing fails
 *
 * @example
 * extractPhoneFromJid("201021347532@s.whatsapp.net") // "201021347532"
 * extractPhoneFromJid("201021347532:80@s.whatsapp.net") // "201021347532"
 * extractPhoneFromJid("120363123456789@g.us") // "120363123456789"
 */
export function extractPhoneFromJid(jid: string): string {
  if (!jid) {
    return '';
  }

  // Match the numeric portion before @ or :
  // Pattern: digits at the start, optionally followed by :device, then @domain
  const match = jid.match(/^(\d+)/);

  return match ? match[1] : jid;
}

/**
 * Checks if a JID is a group JID.
 *
 * @param jid - The WhatsApp JID to check
 * @returns True if the JID is a group JID (ends with @g.us)
 */
export function isGroupJid(jid: string): boolean {
  return jid.endsWith('@g.us');
}

/**
 * Checks if a JID is a user JID.
 *
 * @param jid - The WhatsApp JID to check
 * @returns True if the JID is a user JID (ends with @s.whatsapp.net)
 */
export function isUserJid(jid: string): boolean {
  return jid.endsWith('@s.whatsapp.net');
}
