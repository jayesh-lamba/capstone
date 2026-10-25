const { z } = require('zod');

const registerSchema = z.object({
  tenant_name: z
    .string({ required_error: 'tenant_name is required' })
    .trim()
    .min(2, { message: 'tenant_name must be at least 2 characters long' })
    .max(255, { message: 'tenant_name cannot exceed 255 characters' }),
  email: z
    .string({ required_error: 'email is required' })
    .trim()
    .email({ message: 'Invalid email address format' })
    .max(255, { message: 'email cannot exceed 255 characters' }),
  password: z
    .string({ required_error: 'password is required' })
    .min(8, { message: 'password must be at least 8 characters long' })
    .max(128, { message: 'password cannot exceed 128 characters' }),
});

const loginSchema = z.object({
  email: z
    .string({ required_error: 'email is required' })
    .trim()
    .email({ message: 'Invalid email address format' }),
  password: z
    .string({ required_error: 'password is required' })
    .min(1, { message: 'password is required' }),
});

module.exports = {
  registerSchema,
  loginSchema,
};
