import { describe, expect, it } from "vitest";
import { checkImportUrl } from "./url-guard";

describe("checkImportUrl — allowed", () => {
  it("accepts public https calendar feeds", () => {
    for (const url of [
      "https://canvas.instructure.com/feeds/calendars/user_abc.ics",
      "http://example.edu/calendar.ics",
      "https://calendar.google.com/calendar/ical/x/basic.ics",
    ]) {
      expect(checkImportUrl(url).ok).toBe(true);
    }
  });

  it("rewrites webcal:// to https", () => {
    const res = checkImportUrl("webcal://example.edu/feed.ics");
    expect(res.ok).toBe(true);
    expect(res.url).toBe("https://example.edu/feed.ics");
  });

  it("trims surrounding whitespace", () => {
    expect(checkImportUrl("  https://example.edu/f.ics  ").ok).toBe(true);
  });
});

describe("checkImportUrl — blocked", () => {
  it("rejects non-http schemes", () => {
    for (const url of [
      "file:///etc/passwd",
      "ftp://example.edu/f.ics",
      "gopher://example.edu",
      "data:text/calendar,BEGIN:VCALENDAR",
    ]) {
      expect(checkImportUrl(url).ok).toBe(false);
    }
  });

  it("rejects the cloud metadata endpoint", () => {
    expect(checkImportUrl("http://169.254.169.254/latest/meta-data").ok).toBe(
      false,
    );
  });

  it("rejects loopback and localhost", () => {
    for (const url of [
      "http://127.0.0.1/f.ics",
      "http://localhost:3000/f.ics",
      "http://sub.localhost/f.ics",
      "http://[::1]/f.ics",
    ]) {
      expect(checkImportUrl(url).ok).toBe(false);
    }
  });

  it("rejects private IPv4 ranges", () => {
    for (const url of [
      "http://10.0.0.5/f.ics",
      "http://172.16.4.1/f.ics",
      "http://172.31.255.1/f.ics",
      "http://192.168.1.1/f.ics",
      "http://0.0.0.0/f.ics",
      "http://100.64.0.1/f.ics",
    ]) {
      expect(checkImportUrl(url).ok).toBe(false);
    }
  });

  it("allows public IPv4 that only looks adjacent to private ranges", () => {
    // 172.15 and 172.32 are outside the 172.16–172.31 private block.
    expect(checkImportUrl("http://172.15.0.1/f.ics").ok).toBe(true);
    expect(checkImportUrl("http://172.32.0.1/f.ics").ok).toBe(true);
    expect(checkImportUrl("http://8.8.8.8/f.ics").ok).toBe(true);
  });

  it("rejects internal hostnames", () => {
    for (const url of [
      "http://db.internal/f.ics",
      "http://printer.local/f.ics",
      "http://metadata/computeMetadata",
    ]) {
      expect(checkImportUrl(url).ok).toBe(false);
    }
  });

  it("rejects private and link-local IPv6", () => {
    for (const url of [
      "http://[fe80::1]/f.ics",
      "http://[fc00::1]/f.ics",
      "http://[fd12:3456::1]/f.ics",
      "http://[::ffff:127.0.0.1]/f.ics",
    ]) {
      expect(checkImportUrl(url).ok).toBe(false);
    }
  });

  it("rejects malformed input", () => {
    for (const url of ["", "not a url", "http://", "://nope"]) {
      expect(checkImportUrl(url).ok).toBe(false);
    }
  });
});
