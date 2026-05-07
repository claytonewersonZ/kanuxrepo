import { Profile } from './supabase';

const APP_TIME_ZONE = 'America/Sao_Paulo';

type WorkingHoursProfile = Pick<Profile, 'is_super_admin' | 'work_start_time' | 'work_end_time'> | null | undefined;

function normalizeTime(value?: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  const match = normalized.match(/^(\d{2}:\d{2})/);
  return match ? match[1] : null;
}

function toMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours * 60) + minutes;
}

function getCurrentTimeInZone(): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: APP_TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date());
  } catch {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }
}

export function getWorkingHoursWindow(profile: WorkingHoursProfile) {
  return {
    start: normalizeTime(profile?.work_start_time),
    end: normalizeTime(profile?.work_end_time),
  };
}

export function isOutsideWorkingHours(profile: WorkingHoursProfile): boolean {
  if (!profile || profile.is_super_admin) return false;

  const { start, end } = getWorkingHoursWindow(profile);
  if (!start || !end || start === end) return false;

  const nowMinutes = toMinutes(getCurrentTimeInZone());
  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);

  if (startMinutes < endMinutes) {
    return nowMinutes < startMinutes || nowMinutes >= endMinutes;
  }
  return nowMinutes < startMinutes && nowMinutes >= endMinutes;
}

export function getWorkingHoursRestrictionMessage(profile: WorkingHoursProfile, actionLabel: string): string | null {
  const { start, end } = getWorkingHoursWindow(profile);
  if (!start || !end || !isOutsideWorkingHours(profile)) return null;
  return `Fora do horário de trabalho. Você só pode ${actionLabel} entre ${start} e ${end}.`;
}

export function isValidWorkingHoursInput(value: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}