const { z } = require('zod');

const submissionSchema = z.object({
  widget_id: z.string({ required_error: 'widget_id is required' }).uuid({
    message: 'widget_id must be a valid UUID',
  }),
  payload: z
    .record(z.string(), z.any(), { required_error: 'payload object is required' })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'payload must contain at least one field',
    }),
  _hp_company: z.string().optional(),
  _rendered_at: z.union([z.number(), z.string()]).optional(),
});

module.exports = { submissionSchema };
