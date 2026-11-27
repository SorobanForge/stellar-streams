import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function joinIds(...ids: Array<string | undefined | null | false>): string | undefined {
  const joined = ids.filter((id): id is string => typeof id === 'string' && id.length > 0).join(' ');
  return joined.length > 0 ? joined : undefined;
}
