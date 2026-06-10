import { DailyCapExceededError } from "./usage-tracker.js";

/**
 * Graceful-degradation message for `search_vault` when embedding the query hits
 * the daily cap. Returns `null` for any other error (which we let propagate, so
 * as not to mask a real problem).
 *
 * Belt + braces: with the quota reserve (item 2), search should almost never
 * land here.
 */
export function capExceededSearchMessage(err: unknown): string | null {
  if (err instanceof DailyCapExceededError) {
    return (
      "Daily embedding quota reached — semantic search resumes tomorrow " +
      "(resets at midnight Pacific time). The index already built remains queryable " +
      "via list_documents / get_document."
    );
  }
  return null;
}
