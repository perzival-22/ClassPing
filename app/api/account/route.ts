import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { sql, ensureSchema } from "@/lib/db";

/**
 * Account deletion — the "right to erasure" half of the data controls in
 * Settings (the export half is client-side, since the document already lives
 * in localStorage).
 *
 * Removes every row this user owns across all tables, then deletes the Clerk
 * account itself, which also invalidates the session. Ordered DB-first so that
 * if Clerk deletion fails the user isn't left signed-in with half their data
 * gone — they can retry, and re-deleting already-absent rows is a no-op.
 */

export const runtime = "nodejs";

/** Every table keyed by user_id. Kept explicit so a new table isn't silently
 *  forgotten here — a data-deletion path that misses a table is the kind of
 *  bug that turns into a compliance problem. */
const USER_TABLES = [
  "user_data",
  "push_subscriptions",
  "email_prefs",
  "email_optout",
  "entitlements",
  "push_sent",
  "email_sent",
  "email_reminder_sent",
  "email_post_class_sent",
  "email_weekly_sent",
] as const;

export async function DELETE() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (sql) {
    await ensureSchema();
    for (const table of USER_TABLES) {
      // The identifier can't be a bound parameter, so it's concatenated — but
      // `table` comes only from the hardcoded USER_TABLES constant above, never
      // from the request, so there is no injection surface. The user_id IS
      // bound ($1).
      await sql.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
    }
  }

  try {
    const clerk = await clerkClient();
    await clerk.users.deleteUser(userId);
  } catch (err) {
    // DB rows are already gone; surface the Clerk failure so the client can
    // tell the user their account itself wasn't removed and to retry.
    console.error("[account] clerk delete failed", err);
    return NextResponse.json(
      { error: "account_delete_failed", dataDeleted: true },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
