import { MAX_PHOTOS, MIN_PHOTOS } from './types';

export type DraftError = 'DESCRIPTION_BLANK' | 'NO_PHOTOS' | 'TOO_MANY_PHOTOS';

export function validateDraft(description: string, photoCount: number): DraftError[] {
  const errors: DraftError[] = [];
  if (description.trim().length === 0) errors.push('DESCRIPTION_BLANK');
  if (photoCount < MIN_PHOTOS) errors.push('NO_PHOTOS');
  if (photoCount > MAX_PHOTOS) errors.push('TOO_MANY_PHOTOS');
  return errors;
}

export const draftErrorMessage: Record<DraftError, string> = {
  DESCRIPTION_BLANK: 'Write a short description.',
  NO_PHOTOS: 'Add at least 1 photo.',
  TOO_MANY_PHOTOS: `You can attach at most ${MAX_PHOTOS} photos.`,
};
