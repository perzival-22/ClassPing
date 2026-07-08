# ClassPing

> Your classes and deadlines, right on time.

A friendly student timetable + reminders app, built by a student. Never miss a class or a deadline: plot your week, get pinged before class starts, log assignments the moment a class ends, and keep nagging reminders until things are done.

Built with **Next.js 15 (App Router)**, **React 19**, **Tailwind CSS v4**, and **TypeScript** — a mobile-first web app rendered inside an iOS-style device frame, ready to deploy on **Vercel**.

## Screens

Each mockup from the handoff is a real, interactive route:

| Route         | Screen              | Notes                                                             |
| ------------- | ------------------- | ---------------------------------------------------------------- |
| `/`           | Sign In             | Log in / Sign up toggle, show/hide password → enters the app     |
| `/week`       | Week Timetable      | Computed time-grid, live "now" line, upcoming-class banner       |
| `/class/new`  | Add Class           | Day picker, start/end times, reminder offset, pre-class alarm    |
| `/tasks`      | Tasks / Assignments | Open ↔ Done filter, tap to complete a task                       |
| `/tasks/new`  | Add Assignment      | Class picker, due-in presets, daily reminder toggle              |
| `/prompt`     | Post-Class Prompt   | "Did this class come with an assignment?" → jumps to Add Assignment |
| `/lock`       | Lock-screen Reminders | iOS lock screen with pre-class / due-soon / daily notifications |

Data (classes + tasks) is seeded from the mockups and persisted to `localStorage`, so anything you add or complete survives a refresh. Everything runs client-side — no backend required.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The app is designed mobile-first: on a phone it fills the screen like a native app; on desktop it renders inside a centered iPhone frame.

## Build

```bash
npm run build   # production build
npm start       # serve the production build
```

## Deploy to Vercel

This is a zero-config Next.js app. Either:

- Push to a Git repo and **import it** at [vercel.com/new](https://vercel.com/new), or
- Run the Vercel CLI from the project root:

```bash
npm i -g vercel
vercel          # preview deployment
vercel --prod   # production deployment
```

No environment variables are required.

## Project structure

```
app/
  layout.tsx          # root layout, Fredoka font, store provider
  globals.css         # Tailwind v4 theme tokens (brand palette)
  page.tsx            # Sign In
  week/               # Week Timetable
  class/new/          # Add Class
  tasks/              # Tasks list
  tasks/new/          # Add Assignment
  prompt/             # Post-Class Prompt
  lock/               # Lock-screen Reminders
components/
  PhoneFrame.tsx      # iOS device frame + status bar + home indicator
  TabBar.tsx          # Week · + · Tasks navigation
  Toggle.tsx, icons.tsx, StatusBar.tsx
lib/
  store.tsx           # localStorage-backed classes/tasks store + time helpers
  palette.ts          # per-subject color themes
```

## Design tokens

- **Brand** `#5B54E8` with a `#6157EC → #5045D8` gradient
- **Ink** `#211D46`, **canvas** `#F5F4FA`, **coral accent** `#FF6B57`
- **Display font** Fredoka; body uses the system font stack
- Subject palette: amber, indigo, coral, teal, pink
