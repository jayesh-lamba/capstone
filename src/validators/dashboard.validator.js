const { z } = require('zod');

const submissionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  widget_id: z.string().uuid({ message: 'Invalid widget UUID format' }).optional(),
  search: z.string().trim().max(100).optional(),
  start_date: z
    .string()
    .refine((val) => !val || !isNaN(Date.parse(val)), {
      message: 'Invalid start_date format',
    })
    .optional(),
  end_date: z
    .string()
    .refine((val) => !val || !isNaN(Date.parse(val)), {
      message: 'Invalid end_date format',
    })
    .optional(),
});

const statsQuerySchema = z.object({
  widget_id: z.string().uuid({ message: 'Invalid widget UUID format' }).optional(),
  timeframe: z.enum(['7d', '30d', '90d']).default('7d'),
  start_date: z
    .string()
    .refine((val) => !val || !isNaN(Date.parse(val)), {
      message: 'Invalid start_date format',
    })
    .optional(),
  end_date: z
    .string()
    .refine((val) => !val || !isNaN(Date.parse(val)), {
      message: 'Invalid end_date format',
    })
    .optional(),
});

const geoQuerySchema = z.object({
  widget_id: z.string().uuid({ message: 'Invalid widget UUID format' }).optional(),
});

module.exports = {
  submissionsQuerySchema,
  statsQuerySchema,
  geoQuerySchema,
};
