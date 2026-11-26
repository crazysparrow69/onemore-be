import type { MediaPurpose } from '../../db/schema/media';

const UNSAFE_CHARACTERS = /[^A-Za-z0-9_-]/g;

export function storageKeyOf(input: {
  folder: string;
  userId: string;
  purpose: MediaPurpose;
  id: string;
}): string {
  const user = input.userId.replace(UNSAFE_CHARACTERS, '_');
  return `${input.folder}/u/${user}/${input.purpose}/${input.id}`;
}
