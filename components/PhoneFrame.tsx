/**
 * iOS-style device frame. On small screens it fills the viewport like a real
 * app; from `md` up it renders inside a floating bezel centered on a soft
 * gradient backdrop — matching the ClassPing handoff mockups.
 */
export function PhoneFrame({
  children,
  dark = false,
}: {
  children: React.ReactNode;
  dark?: boolean;
}) {
  return (
    <div
      className="flex min-h-dvh justify-center md:items-center"
      style={{ background: "var(--bg-outer)" }}
    >
      <div
        className="relative h-dvh w-full overflow-hidden md:my-10 md:h-[874px] md:max-h-[calc(100dvh-80px)] md:w-[402px] md:rounded-[48px]"
        style={{
          background: dark ? "#000" : "var(--bg-frame)",
        }}
      >
        <PhoneFrameInner dark={dark}>{children}</PhoneFrameInner>
      </div>
    </div>
  );
}

function PhoneFrameInner({
  children,
  dark,
}: {
  children: React.ReactNode;
  dark: boolean;
}) {
  return (
    <div className="relative flex h-full flex-col">
      {/* screen content */}
      <div
        className="relative flex-1 overflow-hidden"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        {children}
      </div>
      {/* home indicator — mockup only; real devices draw their own */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-[60] hidden h-[26px] items-end justify-center pb-2 md:flex">
        <div
          className="h-[5px] w-[139px] rounded-full"
          style={{
            background: dark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.25)",
          }}
        />
      </div>
    </div>
  );
}
