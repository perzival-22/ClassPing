"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneFrame } from "@/components/PhoneFrame";
import { TabBar } from "@/components/TabBar";
import { NoteEditor } from "@/components/NoteEditor";
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/icons";
import { PALETTE } from "@/lib/palette";
import { useNow, useStore, type ClassItem } from "@/lib/store";
import {
  dayKey,
  dayLabel,
  noteTitle,
  notePreview,
  type NoteItem,
} from "@/lib/notes";

/**
 * Classes, and the notes taken in them.
 *
 * Two panes on a wide screen — the class list beside whatever that class
 * contains — and a drill-down on a phone, because 402px has room for exactly
 * one of the three things this screen holds.
 *
 * The reason the screen exists is the third pane: a student on a laptop in a
 * lecture wants to be typing, not filing. So the app does the filing. It knows
 * which class is in session from the timetable, preselects it, and the primary
 * action writes into a note already stamped with that class and today's date.
 * Nobody names a note during a lecture.
 */

const DAY_ABBR = ["M", "T", "W", "Th", "F"];

function fmtRange(start: number, end: number) {
  const f = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = (mins % 60).toString().padStart(2, "0");
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${m}${h >= 12 ? "pm" : "am"}`;
  };
  return `${f(start)} – ${f(end)}`;
}

export default function ClassesScreen() {
  const {
    activeClasses,
    notes,
    hydrated,
    notesForClass,
    addNote,
    updateNote,
    deleteNote,
  } = useStore();
  const router = useRouter();
  const now = useNow();

  const [classId, setClassId] = useState<string | null>(null);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  /**
   * The student backed out of the class the timetable picked for them. Without
   * this, "back" on a phone would land on the class list and be bounced
   * straight back in by the auto-scope on the next render.
   */
  const [leftLive, setLeftLive] = useState(false);

  /** The class happening right now, if any — what auto-scoping keys off. */
  const liveClassId = useMemo(() => {
    if (!now) return null;
    const day = now.getDay() - 1; // 0 = Mon, matching DayIndex
    if (day < 0 || day > 4) return null;
    const mins = now.getHours() * 60 + now.getMinutes();
    const live = activeClasses.find(
      (c) => c.days.includes(day as 0 | 1 | 2 | 3 | 4) && mins >= c.start && mins <= c.end,
    );
    return live?.id ?? null;
  }, [activeClasses, now]);

  // Nothing chosen yet? Land on whatever is in session. A student who opens
  // this mid-lecture is one tap from typing rather than three.
  const activeId = classId ?? (leftLive ? null : liveClassId);
  const selected = activeClasses.find((c) => c.id === activeId) ?? null;
  const classNotes = selected ? notesForClass(selected.id) : [];
  const openNote = noteId ? notes.find((n) => n.id === noteId) ?? null : null;

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of notes) map.set(n.classId, (map.get(n.classId) ?? 0) + 1);
    return map;
  }, [notes]);

  /** Open today's note for this class, creating it only if there isn't one. */
  function startTodaysNote(target: ClassItem) {
    const today = dayKey(new Date());
    const existing = notesForClass(target.id).find((n) => n.date === today);
    setClassId(target.id);
    setNoteId(existing ? existing.id : addNote(target.id, today));
  }

  if (!hydrated) {
    return (
      <PhoneFrame wide>
        <div className="h-full bg-aurora" />
      </PhoneFrame>
    );
  }

  return (
    <PhoneFrame wide>
      <div className="flex h-full bg-aurora">
        {/* ── pane 1: the classes ── */}
        <div
          className={`${
            selected ? "hidden md:flex" : "flex"
          } h-full w-full shrink-0 flex-col md:w-[268px]`}
          style={{ borderRight: "1px solid var(--line)" }}
        >
          <div className="px-5 pb-3 pt-12 md:pt-8">
            <h1 className="font-[family-name:var(--font-fredoka)] text-[28px] font-semibold leading-tight text-ink">
              Classes
            </h1>
            <p className="mt-0.5 text-[13px] text-muted">
              {activeClasses.length === 0
                ? "Add a class to start taking notes."
                : "Pick one to open its notes."}
            </p>
          </div>

          <div className="no-scrollbar flex-1 overflow-y-auto px-3 pb-32 md:pb-6">
            {activeClasses.length === 0 ? (
              <button
                onClick={() => router.push("/class/new")}
                className="btn-brand mx-2 mt-2 w-[calc(100%-1rem)] rounded-[15px] py-[13px] text-[15px] font-semibold text-white"
              >
                Add your first class
              </button>
            ) : (
              <div className="flex flex-col gap-1.5">
                {activeClasses.map((c) => (
                  <ClassRow
                    key={c.id}
                    c={c}
                    live={c.id === liveClassId}
                    count={counts.get(c.id) ?? 0}
                    active={c.id === activeId}
                    onOpen={() => {
                      setClassId(c.id);
                      setNoteId(null);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── pane 2: this class's notes, or the note itself ── */}
        <div className={`${selected ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
          {!selected ? (
            <EmptyPane />
          ) : openNote ? (
            <NotePane
              note={openNote}
              className={selected.name}
              onBack={() => setNoteId(null)}
              onTitle={(title) => updateNote(openNote.id, { title })}
              onBody={(body) => updateNote(openNote.id, { body })}
              onDelete={() => {
                deleteNote(openNote.id);
                setNoteId(null);
              }}
            />
          ) : (
            <NoteListPane
              c={selected}
              notes={classNotes}
              live={selected.id === liveClassId}
              confirmDelete={confirmDelete}
              onBack={() => {
                setClassId(null);
                setLeftLive(true);
              }}
              onNew={() => startTodaysNote(selected)}
              onOpen={(id) => setNoteId(id)}
              onEditClass={() => router.push(`/class/${selected.id}/edit`)}
              onAskDelete={(id) => setConfirmDelete(id)}
              onCancelDelete={() => setConfirmDelete(null)}
              onDelete={(id) => {
                deleteNote(id);
                setConfirmDelete(null);
              }}
            />
          )}
        </div>

        <TabBar />
      </div>
    </PhoneFrame>
  );
}

function ClassRow({
  c,
  live,
  count,
  active,
  onOpen,
}: {
  c: ClassItem;
  live: boolean;
  count: number;
  active: boolean;
  onOpen: () => void;
}) {
  const t = PALETTE[c.color];
  const days = [...c.days].sort((a, b) => a - b).map((d) => DAY_ABBR[d]).join(" · ");
  return (
    <button
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-[15px] px-3 py-2.5 text-left transition"
      style={{ background: active ? "var(--brand-soft)" : "transparent" }}
    >
      <span
        className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[11px] text-[12.5px] font-bold"
        style={{ background: t.bg, color: t.text }}
      >
        {c.short}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[14.5px] font-semibold text-ink">
            {c.name}
          </span>
          {live && (
            <span className="shrink-0 rounded-full bg-[var(--good)] px-1.5 py-[1px] text-[9.5px] font-bold uppercase text-white">
              Now
            </span>
          )}
        </span>
        <span className="mt-[1px] block truncate text-[12px] text-muted">
          {days}
          {count > 0 ? ` · ${count} note${count === 1 ? "" : "s"}` : ""}
        </span>
      </span>
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-hint md:hidden" />
    </button>
  );
}

function EmptyPane() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <div
        className="mb-4 flex h-[72px] w-[72px] items-center justify-center rounded-[24px] text-[32px]"
        style={{ background: "var(--brand-soft)" }}
      >
        📓
      </div>
      <h2 className="text-[18px] font-semibold text-ink">Pick a class</h2>
      <p className="mt-1.5 max-w-[280px] text-[14px] leading-snug text-muted">
        Every class keeps its own notes, one per lecture. Open one to read
        what you wrote, or start today&apos;s.
      </p>
    </div>
  );
}

function NoteListPane({
  c,
  notes,
  live,
  confirmDelete,
  onBack,
  onNew,
  onOpen,
  onEditClass,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: {
  c: ClassItem;
  notes: NoteItem[];
  live: boolean;
  confirmDelete: string | null;
  onBack: () => void;
  onNew: () => void;
  onOpen: (id: string) => void;
  onEditClass: () => void;
  onAskDelete: (id: string) => void;
  onCancelDelete: () => void;
  onDelete: (id: string) => void;
}) {
  const t = PALETTE[c.color];
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start gap-3 px-5 pb-3 pt-12 md:pt-8">
        <button
          onClick={onBack}
          aria-label="Back to classes"
          className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full md:hidden"
          style={{ background: "var(--surface-2)" }}
        >
          <ArrowLeftIcon className="h-[17px] w-[17px] text-muted" />
        </button>
        <span
          className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[13px] text-[14px] font-bold"
          style={{ background: t.bg, color: t.text }}
        >
          {c.short}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-[family-name:var(--font-fredoka)] text-[22px] font-semibold leading-tight text-ink">
            {c.name}
          </h2>
          <p className="mt-0.5 truncate text-[12.5px] text-muted">
            {fmtRange(c.start, c.end)}
            {c.room ? ` · ${c.room}` : ""}
            {c.instructor ? ` · ${c.instructor}` : ""}
          </p>
        </div>
        <button
          onClick={onEditClass}
          aria-label="Edit class"
          className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          style={{ background: "var(--surface-2)" }}
        >
          <PencilIcon className="h-[15px] w-[15px] text-muted" />
        </button>
      </div>

      <div className="px-5 pb-3">
        <button
          onClick={onNew}
          className="btn-brand flex w-full items-center justify-center gap-2 rounded-[15px] py-[13px] text-[15px] font-semibold text-white transition active:scale-[0.98]"
        >
          <PlusIcon className="h-[18px] w-[18px]" />
          {live ? "Take notes — this class is on now" : "Start today's note"}
        </button>
      </div>

      <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-32 md:pb-8">
        {notes.length === 0 ? (
          <p className="mt-6 text-center text-[13.5px] leading-snug text-muted">
            No notes yet for this class.
            <br />
            One note per lecture — the date fills itself in.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {notes.map((n) => {
              const confirming = confirmDelete === n.id;
              return (
                <div
                  key={n.id}
                  className="overflow-hidden rounded-[16px] bg-white"
                  style={{ boxShadow: "0 2px 10px rgba(30,20,80,.05)" }}
                >
                  <div className="flex items-center">
                    <button
                      onClick={() => onOpen(n.id)}
                      className="min-w-0 flex-1 px-4 py-3 text-left"
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="truncate text-[14.5px] font-semibold text-ink">
                          {noteTitle(n)}
                        </span>
                        <span className="ml-auto shrink-0 text-[11.5px] font-medium text-faint">
                          {dayLabel(n.date)}
                        </span>
                      </div>
                      {notePreview(n.body) && (
                        <p className="mt-0.5 truncate text-[12.5px] text-muted">
                          {notePreview(n.body)}
                        </p>
                      )}
                    </button>
                    <button
                      onClick={() =>
                        confirming ? onCancelDelete() : onAskDelete(n.id)
                      }
                      aria-label="Delete note"
                      className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                      style={{
                        background: confirming
                          ? "var(--danger-soft)"
                          : "var(--surface-2)",
                      }}
                    >
                      <TrashIcon
                        className="h-[14px] w-[14px]"
                        style={{
                          color: confirming
                            ? "var(--danger)"
                            : "var(--color-faint)",
                        }}
                      />
                    </button>
                  </div>
                  {confirming && (
                    <div
                      className="flex items-center justify-between px-4 py-2.5"
                      style={{
                        background: "var(--danger-bg)",
                        borderTop: "1px solid var(--danger-line)",
                      }}
                    >
                      <p className="text-[12.5px] font-medium text-[var(--danger-ink)]">
                        Delete this note? It can&apos;t be undone.
                      </p>
                      <button
                        onClick={() => onDelete(n.id)}
                        className="rounded-full px-3 py-1 text-[12.5px] font-semibold text-white"
                        style={{ background: "var(--danger)" }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function NotePane({
  note,
  className,
  onBack,
  onTitle,
  onBody,
  onDelete,
}: {
  note: NoteItem;
  className: string;
  onBack: () => void;
  onTitle: (title: string) => void;
  onBody: (body: string) => boolean;
  onDelete: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 px-5 pb-2 pt-12 md:px-8 md:pt-7">
        <button
          onClick={onBack}
          aria-label="Back to notes"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          style={{ background: "var(--surface-2)" }}
        >
          <ArrowLeftIcon className="h-[17px] w-[17px] text-muted" />
        </button>
        <div className="min-w-0 flex-1">
          <input
            defaultValue={note.title}
            onChange={(e) => onTitle(e.target.value)}
            placeholder={noteTitle({ title: "", body: note.body })}
            aria-label="Note title"
            className="w-full truncate bg-transparent font-[family-name:var(--font-fredoka)] text-[22px] font-semibold leading-tight text-ink outline-none placeholder:text-hint"
          />
          <p className="truncate text-[12.5px] text-muted">
            {className} · {dayLabel(note.date)}
          </p>
        </div>
        <button
          onClick={onDelete}
          aria-label="Delete note"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          style={{ background: "var(--surface-2)" }}
        >
          <TrashIcon className="h-[14px] w-[14px] text-faint" />
        </button>
      </div>

      {/* Keyed by note id on purpose: switching notes must unmount the editor
          so its cleanup saves the outgoing note through the outgoing note's
          own handler, rather than writing it into the one just opened. */}
      <NoteEditor key={note.id} note={note} onChange={onBody} />
    </div>
  );
}
