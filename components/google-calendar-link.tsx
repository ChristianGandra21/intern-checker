import { CalendarPlus } from "lucide-react";

type CalendarEvent = { title: string; start: string; details?: string; location?: string; className?: string };

function calendarDate(value: Date) {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function googleCalendarUrl({ title, start, details = "", location = "" }: CalendarEvent) {
  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) return null;
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${calendarDate(startDate)}/${calendarDate(endDate)}`,
    details,
    location,
    ctz: "America/Sao_Paulo",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function GoogleCalendarLink(props: CalendarEvent) {
  const href = googleCalendarUrl(props);
  if (!href) return <span className="text-xs text-[var(--ink-soft)]">Defina uma data para adicionar ao calendário.</span>;
  return <a href={href} target="_blank" rel="noreferrer" className={props.className || "button-light"}><CalendarPlus size={16} />Google Calendar</a>;
}
