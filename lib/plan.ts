/**
 * Free/Pro plan constants shared by client UI and server entitlement checks.
 * The slug must match the plan created in the Clerk Billing dashboard.
 */
export const PRO_PLAN = "pro";

/** Free users can keep this many classes; adding beyond it needs Pro.
 *  Users who already have more are grandfathered — we never lock or delete. */
export const FREE_CLASS_LIMIT = 5;
