import { Sidebar } from "./Sidebar";

/**
 * The app frame — one component, two shapes.
 *
 * Below `md` nothing has changed: the screen fills the viewport like a real
 * app, and TabBar floats over it. From `md` up the app stops pretending to be
 * a phone. It used to render a 402px bezel floating on a gradient, which is a
 * fine way to *show* a phone app and a poor way to *use* one on the machine a
 * student actually types on — the whole reason the desktop layout exists.
 *
 * Above the breakpoint the bezel is gone, Sidebar takes over navigation, and
 * the screen's own column is centred and capped. The cap matters: these screens
 * were written for 402px, so letting a card run to 1600px would turn every list
 * row into a hairline of text stranded between two oceans of white. Screens
 * built for the width (the week grid, split views) opt out with `wide`.
 *
 * `chrome={false}` is for the pages that aren't the app — the marketing page,
 * the lock-screen mockup, the email landing — which have no business showing
 * navigation to somebody who may not be signed in.
 */
export function PhoneFrame({
  children,
  dark = false,
  chrome = true,
  wide = false,
}: {
  children: React.ReactNode;
  /** Renders the screen on black — the lock-screen mockup. */
  dark?: boolean;
  /** Show the desktop navigation rail. */
  chrome?: boolean;
  /** Let the screen use the full width instead of the centred column. */
  wide?: boolean;
}) {
  return (
    <div
      className="flex h-dvh w-full overflow-hidden"
      style={{ background: "var(--bg-outer)" }}
    >
      {chrome && <Sidebar />}
      <main
        className="relative h-full min-w-0 flex-1 overflow-hidden"
        style={{ background: dark ? "#000" : "var(--bg-frame)" }}
      >
        <div
          className={`relative h-full ${
            wide
              ? "w-full"
              : chrome
                ? "mx-auto w-full md:max-w-[760px]"
                : // Outside the app: sign-in, the lock-screen mockup, the email
                  // landing. Each is one message and one button, and a wide
                  // column of centred text reads as a poster, not a screen.
                  "mx-auto w-full md:max-w-[460px]"
          }`}
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
