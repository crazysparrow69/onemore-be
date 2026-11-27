import { z } from 'zod';

export const instantResponse = z.string().meta({ format: 'date-time' });

export const dateResponse = z.string().meta({ format: 'date' });
