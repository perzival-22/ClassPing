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
      style={{
        background:
          "radial-gradient(1200px 700px at 20% -10%, #F1EFFB 0%, #E7E5F3 55%, #E2E0EE 100%)",
      }}
    >
      <div
        className="relative w-full overflow-hidden md:my-10 md:w-[402px] md:rounded-[48px]"
        style={{
          height: "100dvh",
          maxHeight: "100dvh",
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
    <div className="relative flex h-full flex-col md:h-[874px] md:max-h-[calc(100dvh-80px)]">
      {/* screen content */}
      <div
        className="relative flex-1 overflow-hidden"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        {children}
      </div>
      {/* home indicator */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-[60] flex h-[26px] items-end justify-center pb-2">
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
