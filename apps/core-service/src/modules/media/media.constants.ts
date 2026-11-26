import type { MediaPurpose } from '../../db/schema/media';

export const MAX_OPEN_UPLOADS = 10;

export const UPLOAD_LIMITS: Readonly<
  Record<MediaPurpose, { maxSide: number }>
> = {
  avatar: { maxSide: 1024 },
  exercise_photo: { maxSide: 1600 },
};

export const UPLOAD_FORMATS = ['jpg', 'png', 'webp'] as const;

export const ABANDONED_UPLOAD_HOURS = 24;

export const NAMED_TRANSFORMATIONS = {
  avatar_sm: 'c_fill,w_96,h_96,f_auto,q_auto',
  avatar_lg: 'c_fill,w_192,h_192,f_auto,q_auto',
  exercise_thumb: 'c_fill,w_128,h_128,f_auto,q_auto',
  exercise_photo: 'c_limit,w_960,h_960,f_auto,q_auto',
} as const satisfies Record<string, string>;

export type NamedTransformation = keyof typeof NAMED_TRANSFORMATIONS;
