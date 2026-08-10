import { ImageResponse } from "next/og";

/**
 * The social card shown when a ClassPing link is pasted into a chat, a group
 * DM, or a tweet — which for a student app is most of how it spreads.
 *
 * Generated rather than checked in as a PNG: it stays in sync with the brand
 * colours, needs no design tooling, and there's no binary in the repo to go
 * stale. 1200x630 is the size every platform crops from.
 */

export const alt = "ClassPing — your classes and deadlines, right on time";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #5B54E8 0%, #8B5CF6 60%, #A855F7 100%)",
          fontFamily: "sans-serif",
          color: "#fff",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 132,
            height: 132,
            borderRadius: 38,
            background: "rgba(255,255,255,0.16)",
            fontSize: 74,
          }}
        >
          🔔
        </div>
        <div
          style={{
            marginTop: 40,
            fontSize: 82,
            fontWeight: 700,
            letterSpacing: -2,
          }}
        >
          ClassPing
        </div>
        <div
          style={{
            marginTop: 18,
            fontSize: 36,
            color: "rgba(255,255,255,0.88)",
            textAlign: "center",
            maxWidth: 820,
            lineHeight: 1.3,
          }}
        >
          Your classes and deadlines, right on time.
        </div>
        <div
          style={{
            marginTop: 44,
            fontSize: 25,
            color: "rgba(255,255,255,0.72)",
          }}
        >
          Timetable · Assignments · Reminders that reach you
        </div>
      </div>
    ),
    size,
  );
}
