# ClassPing

> Your classes and deadlines, right on time.

A friendly student timetable + reminders app, built by a student. Never miss a class or a deadline: plot your week, get pinged before class starts, log assignments the moment a class ends, track your grades, and keep nagging reminders until things are done.

Built with **Next.js 15 (App Router)**, **React 19**, **TypeScript**, and **Tailwind CSS v4**, with **Clerk** for auth + billing and **Neon Postgres** for cloud sync — a mobile-first PWA rendered inside an iOS-style device frame, deployed on **Vercel**.

📖 **New engineer?** Start with the [Engineering Handbook](docs/ENGINEERING_HANDBOOK.md) — architecture, data flow, and the SOPs for shipping a change.

## How it works, in one paragraph

ClassPing is **local-first**. Your classes, tasks, grades, and profile live in one document in the browser's `localStorage`, held by a single React context ([`lib/store.tsx`](lib/store.tsx)). The app works fully offline. On top of that sits a thin, optional cloud layer — two API routes, both **Pro-only**: `/api/sync` mirrors the document to Postgres so it follows you across devices, and `/api/export` turns it into an `.ics` calendar file.

## Screens

| Route | Screen | Plan |
| --- | --- | --- |
| `/` | Sign in / Sign up (email + password, Google OAuth) | Public |
| `/home` | Today's schedule, open assignments, class list | Free |
| `/week` | Mon–Fri time grid with a live "now" line | Free |
| `/class/new`, `/class/[id]/edit` | Add / edit a class — days, times, reminder lead time, alarm, color | Free (≤5 classes) |
| `/tasks`, `/tasks/new` | Assignments — Open ↔ Done filter, due-in presets | Free |
| `/prompt` | Post-class nudge: "did this class come with an assignment?" | Free |
| `/settings` | Profile, theme, accent, calendar export, sign out | Free |
| `/lock` | Lock-screen reminder mockup | Free |
| `/grades`, `/grades/new` | Grades & GPA tracker, DaysToFinals countdown | **Pro** |
| `/upgrade` | Clerk pricing table + checkout | — |

**Pro** (via Clerk Billing) unlocks: unlimited classes, cloud sync across devices, the grades/GPA tracker, calendar export, extra reminder lead times, and premium themes.

## Reminders — read this before filing a bug

There are two independent delivery paths, and the difference trips people up:

- **In-app reminders** (Free) are scheduled by a 30-second loop in the store. They only fire **while a ClassPing tab is open** — there is no push server and no cron.
- **Calendar export** (Pro) writes an `.ics` with weekly recurrences and alarms, handing your reminders to the phone's *native* calendar. This is what fires **with the app closed**, and it's the whole reason the feature exists.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your Clerk keys
npm run dev                  # http://localhost:3000
```

Mobile-first: on a phone it fills the screen like a native app; on desktop it renders inside a centered iPhone frame.

### Environment variables

See [`.env.example`](.env.example) for the annotated list. In short:

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | ✅ | Clerk, client side |
| `CLERK_SECRET_KEY` | ✅ | Clerk, server side — **secret** |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `SIGN_UP_URL` | ✅ | Keeps auth on our `/` screen, not Clerk's hosted pages |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` / `SIGN_UP_…` | ✅ | Where to land after auth (`/home`) |
| `DATABASE_URL` | ⬜ Optional | Neon Postgres for Pro sync. Unset → `/api/sync` returns `503` and the app runs offline-only. |

Check the database with `node scripts/check-db.mjs` — it creates the `user_data` table if needed and prints the row count.

## Build

```bash
npm run lint
npx tsc --noEmit
npm run build   # production build
npm start       # serve the production build
```

## Deploy

The Vercel Git integration builds `main` and **promotes it straight to production** — pushing to `main` *is* releasing. Set the environment variables above in the Vercel project first (Settings → Environment Variables) for both Preview and Production.

See [Engineering Handbook §3](docs/ENGINEERING_HANDBOOK.md#section-3-versioning-updates--maintenance-sops) for the branching strategy, the pre-merge QA matrix, and the rollback procedure.

## Project structure

```text
app/
  layout.tsx            # ClerkProvider > StoreProvider > children
  globals.css           # Tailwind v4 theme tokens + accent themes
  page.tsx              # Sign in / Sign up (the only public screen)
  home/ week/ tasks/    # Free screens
  class/new/ class/[id]/edit/
  grades/ upgrade/ settings/ prompt/ lock/ sso-callback/
  api/
    sync/route.ts       # PRO — GET pull / PUT push the whole document
    export/route.ts     # PRO — POST → text/calendar (.ics)
components/             # PhoneFrame, TabBar, ColorPicker, Skeleton, …
lib/
  store.tsx             # ⭐ state, persistence, sync, reminder loop
  entitlements.ts       # ⭐ server source of truth for Pro
  useIsPro.ts           # client Pro check — UI only, never a real gate
  db.ts calendar.ts gpa.ts notifications.ts avatar.ts ratelimit.ts
  plan.ts palette.ts accents.ts
middleware.ts           # Clerk route protection
public/sw.js            # service worker — notifications + offline app shell
```

## Conventions worth knowing

- **`useIsPro()` decides what to *show*; `isPro()` decides what to *allow*.** Every Pro action with a real server cost re-checks the entitlement in [`lib/entitlements.ts`](lib/entitlements.ts).
- **Respect the `hydrated` flag.** `localStorage` doesn't exist during SSR, so any screen reading store data must render a skeleton until `hydrated` is true — otherwise you ship a hydration mismatch.
- **Persisted shapes are a contract.** The store document and the `.ics` UID scheme already exist on users' devices and in Postgres. Add optional fields; never rename or drop one without a migration path.

## Design tokens

- **Brand** `#5B54E8` with a `#6157EC → #5045D8` gradient
- **Ink** `#211D46`, **canvas** `#F5F4FA`, **coral accent** `#FF6B57`
- **Display font** Fredoka; body uses the system font stack
- Subject palette: amber, indigo, coral, teal, pink (+ violet, mint, ocean, slate on Pro)
- App accents: classic (free) + ocean, sunset, forest, rose (Pro)
