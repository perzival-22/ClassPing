"use client";

export function Toggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors"
      style={{ background: on ? "var(--good)" : "var(--surface-3)" }}
    >
      {/* Explicitly white, not `bg-white`: the knob is a physical switch, and
          the dark-mode retheme of that class would paint it into the track. */}
      <span
        className="absolute top-[2px] h-[27px] w-[27px] rounded-full transition-all"
        style={{
          left: on ? 22 : 2,
          background: "#fff",
          boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
        }}
      />
    </button>
  );
}
