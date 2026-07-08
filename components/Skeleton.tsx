/**
 * Skeleton screens — each previews its real screen's layout while data loads.
 * Static chrome (PhoneFrame, TabBar) renders for real; only content is boned.
 * The `.skeleton` class fades in after 150ms, so instant loads never flash.
 */
import { PhoneFrame } from "./PhoneFrame";
import { TabBar } from "./TabBar";

function Bone({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div aria-hidden className={`skeleton ${className}`} style={style} />;
}

/** White card shell matching the app's list cards. */
function CardShell({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-[18px] bg-white ${className}`}
      style={{ boxShadow: "0 2px 10px rgba(30,20,80,.05)" }}
    >
      {children}
    </div>
  );
}

function ClassCardBone() {
  return (
    <CardShell className="flex items-center gap-3 px-4 py-4">
      <Bone className="h-[44px] w-[44px] shrink-0 rounded-[13px]" />
      <div className="min-w-0 flex-1">
        <Bone className="h-[15px] w-2/3 rounded-md" />
        <Bone className="mt-2 h-[13px] w-1/3 rounded-md" />
      </div>
    </CardShell>
  );
}

export function HomeSkeleton() {
  return (
    <PhoneFrame>
      <div className="flex h-full flex-col bg-aurora">
        <div className="px-5 pb-2 pt-16">
          <Bone className="h-[13px] w-40 rounded-md" />
          <Bone className="mt-2.5 h-[30px] w-60 rounded-lg" />
        </div>
        <div className="px-5 pb-3 pt-1">
          <Bone className="h-[30px] w-48 rounded-full" />
        </div>
        <div className="flex-1 overflow-hidden px-5 pt-1">
          <div className="flex flex-col gap-3">
            <ClassCardBone />
            <ClassCardBone />
            <ClassCardBone />
          </div>
          <div className="mb-3 mt-8 flex items-center justify-between">
            <Bone className="h-[17px] w-28 rounded-md" />
            <Bone className="h-[28px] w-16 rounded-full" />
          </div>
          <div className="flex flex-col gap-2.5">
            <ClassCardBone />
            <ClassCardBone />
          </div>
        </div>
        <TabBar />
      </div>
    </PhoneFrame>
  );
}

export function WeekSkeleton() {
  // Plausible block positions per weekday column (top px, height px)
  const columns: [number, number][][] = [
    [
      [8, 56],
      [140, 88],
    ],
    [[70, 72]],
    [
      [8, 56],
      [200, 60],
    ],
    [[110, 88]],
    [
      [40, 60],
      [180, 72],
    ],
  ];
  return (
    <PhoneFrame>
      <div className="flex h-full flex-col bg-aurora">
        <div className="flex items-end justify-between px-5 pb-2 pt-16">
          <div>
            <Bone className="h-[13px] w-24 rounded-md" />
            <Bone className="mt-2.5 h-[32px] w-44 rounded-lg" />
          </div>
          <Bone className="h-10 w-10 rounded-full" />
        </div>
        <div className="flex-1 overflow-hidden px-3 pt-1.5">
          <div className="mb-1.5 flex">
            <div className="w-[30px]" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                <Bone className="h-[11px] w-7 rounded" />
                <Bone className="h-[26px] w-[26px] rounded-full" />
              </div>
            ))}
          </div>
          <div className="flex">
            <div className="w-[30px]" />
            <div className="flex flex-1">
              {columns.map((blocks, i) => (
                <div key={i} className="relative flex-1" style={{ height: 420 }}>
                  {blocks.map(([top, height], j) => (
                    <Bone
                      key={j}
                      className="absolute left-[2px] right-[2px] rounded-lg"
                      style={{ top, height }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
        <TabBar />
      </div>
    </PhoneFrame>
  );
}

export function TasksSkeleton() {
  return (
    <PhoneFrame>
      <div className="flex h-full flex-col bg-aurora">
        <div className="flex items-end gap-2.5 px-5 pb-2 pt-16">
          <Bone className="h-[32px] w-28 rounded-lg" />
          <Bone className="mb-1 h-[24px] w-16 rounded-full" />
        </div>
        <div className="px-5 pb-1 pt-2">
          <Bone className="h-[38px] w-full rounded-xl" />
        </div>
        <div className="flex flex-1 flex-col gap-[11px] overflow-hidden px-[18px] pt-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardShell key={i} className="flex items-start gap-3 px-4 py-[15px]">
              <Bone className="mt-0.5 h-[26px] w-[26px] shrink-0 rounded-full" />
              <div className="min-w-0 flex-1">
                <Bone className="h-[16px] w-3/4 rounded-md" />
                <Bone className="mt-2 h-[13px] w-1/3 rounded-md" />
              </div>
              <Bone className="h-[24px] w-[74px] rounded-full" />
            </CardShell>
          ))}
        </div>
        <TabBar />
      </div>
    </PhoneFrame>
  );
}

export function SettingsSkeleton() {
  return (
    <PhoneFrame>
      <div className="flex h-full flex-col bg-aurora">
        <div className="flex items-center px-5 pb-3 pt-16">
          <Bone className="h-[28px] w-32 rounded-lg" />
        </div>
        <div className="flex-1 overflow-hidden px-5">
          <div
            className="rounded-[24px] bg-white px-5 py-6"
            style={{ boxShadow: "0 2px 12px rgba(30,20,80,.07)" }}
          >
            <Bone className="mb-5 h-[11px] w-16 rounded" />
            <div className="mb-6 flex flex-col items-center gap-3">
              <Bone className="h-[90px] w-[90px] rounded-full" />
              <Bone className="h-[14px] w-24 rounded-md" />
            </div>
            <Bone className="h-[52px] w-full rounded-[15px]" />
            <Bone className="mt-3 h-[48px] w-full rounded-[15px]" />
          </div>
          <div
            className="mt-4 rounded-[24px] bg-white px-5 py-4"
            style={{ boxShadow: "0 2px 12px rgba(30,20,80,.07)" }}
          >
            <Bone className="h-[20px] w-full rounded-md" />
          </div>
        </div>
        <TabBar />
      </div>
    </PhoneFrame>
  );
}

export function SignInSkeleton() {
  return (
    <PhoneFrame>
      <div className="h-full" style={{ background: "var(--bg-signin)" }}>
        <div className="flex h-full flex-col px-7 pb-10">
          <div className="flex flex-1 flex-col items-center justify-center pt-8">
            <Bone className="h-[84px] w-[84px] rounded-[25px]" />
            <Bone className="mt-[22px] h-[34px] w-44 rounded-lg" />
            <Bone className="mt-3 h-[14px] w-52 rounded-md" />
            <Bone className="mt-9 h-[46px] w-full rounded-[14px]" />
            <Bone className="mt-4 h-[62px] w-full rounded-[15px]" />
            <Bone className="mt-3 h-[62px] w-full rounded-[15px]" />
            <Bone className="mt-7 h-[50px] w-full rounded-[15px]" />
            <Bone className="mt-3 h-[50px] w-full rounded-[15px]" />
          </div>
          <Bone className="h-[58px] w-full rounded-[17px]" />
        </div>
      </div>
    </PhoneFrame>
  );
}
