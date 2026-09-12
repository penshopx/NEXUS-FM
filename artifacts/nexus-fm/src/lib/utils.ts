import { twMerge } from 'tailwind-merge';

import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getSafeMutationMessage(error: unknown): string {
  const status = typeof error === 'object' && error !== null && 'status' in error
    ? (error as { status: number }).status
    : undefined;

  switch (status) {
    case 400: return 'The request was invalid. Please check your inputs and try again.';
    case 401: return 'You must be logged in to perform this action.';
    case 403: return 'You do not have permission to perform this action.';
    case 404: return 'The requested record could not be found.';
    case 409: return 'This action conflicts with an existing record.';
    default:
      if (status !== undefined && status >= 500) {
        return 'The server encountered an error. Please try again later.';
      }
      return 'An unexpected error occurred. Please try again.';
  }
}
