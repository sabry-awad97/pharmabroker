import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(input: Date | string | number): string {
  let seconds: number;

  if (input instanceof Date) {
    seconds = Math.round((Date.now() - input.getTime()) / 1000);
  } else if (typeof input === 'string') {
    seconds = Math.round((Date.now() - new Date(input).getTime()) / 1000);
  } else {
    seconds = input;
  }

  const suffix = seconds < 0 ? 'from now' : 'ago';
  seconds = Math.abs(seconds);

  const times = [
    seconds / 60 / 60 / 24 / 365, // years
    seconds / 60 / 60 / 24 / 30, // months
    seconds / 60 / 60 / 24 / 7, // weeks
    seconds / 60 / 60 / 24, // days
    seconds / 60 / 60, // hours
    seconds / 60, // minutes
    seconds, // seconds
  ];

  const names = ['year', 'month', 'week', 'day', 'hour', 'minute', 'second'];

  for (let i = 0; i < names.length; i++) {
    const time = Math.floor(times[i]);
    let name = names[i];
    if (time > 1) name += 's';
    if (time >= 1) return `${time} ${name} ${suffix}`;
  }

  return `0 seconds ${suffix}`;
}
