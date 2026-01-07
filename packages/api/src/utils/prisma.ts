/**
 * Utility for Prisma database operations
 */

/**
 * Escapes SQL wildcard characters (_, %) and the escape character (\)
 * for use in Prisma 'contains', 'startsWith', or 'endsWith' filters.
 *
 * Prisma uses SQL LIKE/ILIKE under the hood for these filters.
 * By default, _, % and \ are special characters in SQL LIKE patterns.
 * This function escapes them so they are treated as literal characters.
 *
 * @param search The search string to escape
 * @returns The escaped search string
 */
export function escapeSqlWildcards(search: string): string {
  // Order matters: escape the escape character first
  return search
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}
