const { z } = require('zod');

const widgetParamSchema = z.object({
  id: z.string().uuid({ message: 'Widget ID must be a valid UUID' }),
});

const fieldDefinitionSchema = z.object({
  name: z
    .string({ required_error: 'Field name is required' })
    .trim()
    .min(1, { message: 'Field name cannot be empty' })
    .regex(/^[a-zA-Z0-9_-]+$/, {
      message: 'Field name can only contain letters, numbers, underscores, and dashes',
    }),
  type: z.enum(['text', 'email', 'tel', 'number', 'textarea'], {
    errorMap: () => ({ message: "Field type must be one of: 'text', 'email', 'tel', 'number', 'textarea'" }),
  }),
  label: z.string({ required_error: 'Field label is required' }).trim().min(1, { message: 'Field label cannot be empty' }),
  required: z.boolean().optional().default(false),
});

const displayRulesSchema = z.object({
  position: z
    .enum(['bottom-right', 'bottom-left', 'center-modal', 'inline'])
    .optional()
    .default('bottom-right'),
  theme_color: z
    .string()
    .trim()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, {
      message: 'theme_color must be a valid hex color code (e.g. #2563eb)',
    })
    .optional()
    .default('#2563eb'),
  allowed_origins: z.array(z.string().trim()).optional().default(['*']),
});

const createWidgetSchema = z.object({
  name: z
    .string({ required_error: 'name is required' })
    .trim()
    .min(1, { message: 'name must be at least 1 character long' })
    .max(255, { message: 'name cannot exceed 255 characters' }),
  type: z
    .enum(['signup_form', 'cta', 'popover'], {
      errorMap: () => ({ message: "type must be one of: 'signup_form', 'cta', 'popover'" }),
    })
    .optional()
    .default('signup_form'),
  title: z
    .string({ required_error: 'title is required' })
    .trim()
    .min(1, { message: 'title must be at least 1 character long' })
    .max(255, { message: 'title cannot exceed 255 characters' }),
  description: z.string().trim().max(1000).optional().default(''),
  button_text: z.string().trim().min(1).max(100).optional().default('Submit'),
  fields_schema: z
    .array(fieldDefinitionSchema, { required_error: 'fields_schema must be an array of field definitions' })
    .min(1, { message: 'fields_schema must include at least one field' }),
  display_rules: displayRulesSchema.optional().default({}),
  is_active: z.boolean().optional().default(true),
});

const updateWidgetSchema = createWidgetSchema.partial();

module.exports = {
  widgetParamSchema,
  createWidgetSchema,
  updateWidgetSchema,
};
