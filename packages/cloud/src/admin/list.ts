import { ADMIN_LIST_MAXIMUM } from '#cloud/admin/schema'
import type { CloudDatabase } from '#cloud/server/db'
import { clamp, zipObject } from 'es-toolkit'
import type { SelectQueryBuilder } from 'kysely'

/** The rows an admin list returns when the request does not say. */
export const ADMIN_PAGE_SIZE = 50

/** What every admin list takes: words to search for, one of its filters, and a page. */
export type AdminListQuery<Filter extends string> = {
  search?: string
  filter?: Filter
  limit?: number
  offset?: number
}

/** A `like` pattern that finds `search` anywhere, matching `%`, `_`, and `\` literally. */
export function containsPattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, (character) => `\\${character}`)}%`
}

/** The search words, or undefined when there are none. */
export function listSearch(query: AdminListQuery<string>): string | undefined {
  return query.search?.trim() || undefined
}

/** The page a query asks for, kept within what one request may return. */
export function listWindow(query: AdminListQuery<string>) {
  return {
    limit: clamp(query.limit ?? ADMIN_PAGE_SIZE, 1, ADMIN_LIST_MAXIMUM),
    offset: Math.max(0, query.offset ?? 0)
  }
}

/** How many rows `matching` selects under each filter, counted together. */
export async function countEachFilter<Filter extends string, Table extends keyof CloudDatabase>(
  filters: readonly Filter[],
  matching: (filter: Filter) => SelectQueryBuilder<CloudDatabase, Table, object>
): Promise<Record<Filter, number>> {
  const counts = await Promise.all(
    filters.map(async (filter) => {
      const row = await matching(filter)
        .select(({ fn }) => fn.countAll<number>().as('count'))
        .executeTakeFirstOrThrow()
      return Number(row.count)
    })
  )
  return zipObject(filters, counts)
}
