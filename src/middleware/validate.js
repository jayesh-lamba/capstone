/**
 * Middleware factory for validating incoming request objects using Zod schemas.
 *
 * @param {Object} schemas
 * @param {import('zod').ZodSchema} [schemas.body]
 * @param {import('zod').ZodSchema} [schemas.params]
 * @param {import('zod').ZodSchema} [schemas.query]
 */
function validate({ body, params, query }) {
  return (req, res, next) => {
    try {
      if (body) {
        req.body = body.parse(req.body);
      }
      if (params) {
        req.params = params.parse(req.params);
      }
      if (query) {
        req.query = query.parse(req.query);
      }
      next();
    } catch (err) {
      if (err.errors) {
        const details = err.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));

        return res.status(400).json({
          status: 'error',
          code: 'VALIDATION_ERROR',
          error: {
            code: 'VALIDATION_ERROR',
            message: details[0]?.message || 'Invalid request payload',
            details,
          },
        });
      }
      next(err);
    }
  };
}

module.exports = { validate };
