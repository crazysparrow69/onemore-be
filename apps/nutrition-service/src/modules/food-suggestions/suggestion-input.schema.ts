import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { createIdParamsDto } from '../../common/validation';

export const searchSuggestionsQuerySchema = z
  .object({
    q: z.string().trim().max(100).default('').meta({
      description:
        'Part of the name. Empty returns the most recently used foods',
    }),
    limit: z.coerce.number().int().min(1).max(20).default(10),
  })
  .meta({ id: 'SearchSuggestionsQuery' });

export class SearchSuggestionsQueryDto extends createZodDto(
  searchSuggestionsQuerySchema,
) {}

export class SuggestionIdParamsDto extends createIdParamsDto(
  'SuggestionIdParams',
) {}
