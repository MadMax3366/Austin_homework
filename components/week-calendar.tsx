"use client";

import { useMemo, useState } from "react";
import { CalendarDays, MapPin, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type WeekCalendarEvent = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  teacher?: string | null;
  room?: string | null;
  status?: string | null;
  kind?: string | null;
  participants?: number | null;
};

const weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const statusLabels: Record<string, string> = {
  scheduled: "待上课",
  completed: "已完成",
  cancelled: "已取消",
};
const kindLabels: Record<string, string> = {
  regular: "正式课",
  trial: "试听课",
  makeup: "补课",
  private: "一对一",
};

function dateOffset(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function mondayFor(date: string): string {
  const value = new Date(`${date}T12:00:00Z`);
  const day = value.getUTCDay();
  return dateOffset(date, day === 0 ? -6 : 1 - day);
}

function minutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function displayTime(value: string): string {
  return value.slice(0, 5);
}

function displayDate(date: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function eventTone(event: WeekCalendarEvent): string {
  if (event.status === "cancelled") return "border-slate-300 bg-slate-100 text-slate-500";
  if (event.kind === "trial") return "border-amber-300 bg-amber-50 text-amber-950";
  if (event.kind === "makeup") return "border-violet-300 bg-violet-50 text-violet-950";
  return "border-cyan-300 bg-cyan-50 text-[var(--navy-950)]";
}

export function WeekCalendar({
  events,
  anchorDate,
  emptyText = "本周暂无课程",
}: {
  events: WeekCalendarEvent[];
  anchorDate: string;
  emptyText?: string;
}) {
  const weekStart = mondayFor(anchorDate);
  const days = useMemo(
    () => weekdays.map((label, index) => ({ label, date: dateOffset(weekStart, index) })),
    [weekStart],
  );
  const [mode, setMode] = useState<"week" | "day">("week");
  const [selectedDate, setSelectedDate] = useState(anchorDate);
  const visibleDays = mode === "week" ? days : days.filter((day) => day.date === selectedDate);
  const startHour = Math.min(8, ...events.map((event) => Math.floor(minutes(event.startTime) / 60)));
  const endHour = Math.max(19, ...events.map((event) => Math.ceil(minutes(event.endTime) / 60)));
  const hourCount = Math.max(1, endHour - startHour);
  const canvasHeight = hourCount * 64;

  if (!events.length) {
    return (
      <div className="grid min-h-72 place-items-center rounded-xl border border-dashed bg-white text-sm text-muted-foreground">
        <span className="flex items-center gap-2"><CalendarDays className="size-4" />{emptyText}</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <p className="font-medium">{displayDate(weekStart)} — {displayDate(dateOffset(weekStart, 6))}</p>
        <div className="flex rounded-lg bg-muted p-1">
          <Button type="button" size="sm" variant={mode === "week" ? "default" : "ghost"} onClick={() => setMode("week")}>周</Button>
          <Button type="button" size="sm" variant={mode === "day" ? "default" : "ghost"} onClick={() => setMode("day")}>日</Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className={cn("min-w-[840px]", mode === "day" && "min-w-[520px]") }>
          <div className="grid border-b" style={{ gridTemplateColumns: `64px repeat(${visibleDays.length}, minmax(0, 1fr))` }}>
            <div />
            {visibleDays.map((day) => (
              <button
                type="button"
                key={day.date}
                className={cn("border-l px-2 py-3 text-center hover:bg-muted", day.date === anchorDate && "bg-cyan-50")}
                onClick={() => {
                  setSelectedDate(day.date);
                  setMode("day");
                }}
              >
                <span className="block text-xs text-muted-foreground">{day.label}</span>
                <span className="mt-0.5 block text-sm font-semibold">{displayDate(day.date)}</span>
              </button>
            ))}
          </div>
          <div className="grid" style={{ gridTemplateColumns: `64px repeat(${visibleDays.length}, minmax(0, 1fr))` }}>
            <div className="relative border-r" style={{ height: canvasHeight }}>
              {Array.from({ length: hourCount + 1 }, (_, index) => (
                <span key={index} className="absolute right-2 -translate-y-1/2 text-[11px] text-muted-foreground" style={{ top: index * 64 }}>
                  {String(startHour + index).padStart(2, "0")}:00
                </span>
              ))}
            </div>
            {visibleDays.map((day) => (
              <div key={day.date} className="relative border-r last:border-r-0" style={{ height: canvasHeight }}>
                {Array.from({ length: hourCount + 1 }, (_, index) => (
                  <div key={index} className="absolute inset-x-0 border-t" style={{ top: index * 64 }} />
                ))}
                {events.filter((event) => event.date === day.date).map((event) => {
                  const top = ((minutes(event.startTime) - startHour * 60) / 60) * 64;
                  const height = Math.max(44, ((minutes(event.endTime) - minutes(event.startTime)) / 60) * 64);
                  return (
                    <article
                      key={event.id}
                      className={cn("absolute inset-x-1 overflow-hidden rounded-md border px-2 py-1.5 text-xs shadow-sm", eventTone(event))}
                      style={{ top, height }}
                      title={`${event.title} ${displayTime(event.startTime)}–${displayTime(event.endTime)}`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <strong className="truncate">{event.title}</strong>
                        {event.kind ? <Badge variant="outline" className="h-5 shrink-0 px-1 text-[10px]">{kindLabels[event.kind] ?? event.kind}</Badge> : null}
                      </div>
                      <p className="mt-1 font-medium">{displayTime(event.startTime)}–{displayTime(event.endTime)}</p>
                      {event.teacher ? <p className="mt-1 flex items-center gap-1 truncate"><UserRound className="size-3" />{event.teacher}</p> : null}
                      {event.room ? <p className="mt-0.5 flex items-center gap-1 truncate"><MapPin className="size-3" />{event.room}</p> : null}
                      {event.status ? <span className="sr-only">{statusLabels[event.status] ?? event.status}</span> : null}
                    </article>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
