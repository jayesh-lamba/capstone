const { query } = require('../db');
const geoService = require('./geo.service');
const sideEffectService = require('./sideEffect.service');

class SubmissionService {
  /**
   * Process and store a public lead submission.
   *
   * @param {Object} params
   * @param {string} params.widget_id
   * @param {Object} params.payload
   * @param {string} params.visitor_ip
   * @param {string} [params.user_agent]
   * @param {string} [params.origin]
   * @returns {Promise<Object>}
   */
  async createSubmission({ widget_id, payload, visitor_ip, user_agent, origin }) {
    // 1. Fetch and validate widget existence & active status
    const widgetRes = await query(
      `SELECT id, tenant_id, name, title, fields_schema, display_rules, is_active
       FROM widgets
       WHERE id = $1`,
      [widget_id]
    );

    const widget = widgetRes.rows[0];
    if (!widget || !widget.is_active) {
      const err = new Error('Widget not found or inactive');
      err.statusCode = 404;
      err.code = 'WIDGET_NOT_FOUND';
      throw err;
    }

    // 2. Validate Origin against widget's display_rules.allowed_origins
    const displayRules = widget.display_rules || {};
    const allowedOrigins = Array.isArray(displayRules.allowed_origins)
      ? displayRules.allowed_origins
      : ['*'];

    if (origin && !allowedOrigins.includes('*') && !allowedOrigins.includes(origin)) {
      const err = new Error(`Origin '${origin}' is not permitted to submit to this widget.`);
      err.statusCode = 403;
      err.code = 'FORBIDDEN_ORIGIN';
      throw err;
    }

    // 3. Validate form payload against widget's dynamic fields_schema
    if (!payload || typeof payload !== 'object' || Object.keys(payload).length === 0) {
      const err = new Error('Submission payload must contain at least one field');
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    const fieldsSchema = Array.isArray(widget.fields_schema) ? widget.fields_schema : [];

    for (const field of fieldsSchema) {
      const val = payload[field.name];

      // Check required fields
      if (field.required) {
        if (val === undefined || val === null || (typeof val === 'string' && val.trim() === '')) {
          const err = new Error(`Field '${field.label || field.name}' is required`);
          err.statusCode = 422;
          err.code = 'VALIDATION_ERROR';
          throw err;
        }
      }

      // Check field types when value is provided
      if (val !== undefined && val !== null && val !== '') {
        if (field.type === 'email') {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (typeof val !== 'string' || !emailRegex.test(val.trim())) {
            const err = new Error(`Invalid email address format for field '${field.label || field.name}'`);
            err.statusCode = 400;
            err.code = 'VALIDATION_ERROR';
            throw err;
          }
        } else if (field.type === 'number') {
          if (isNaN(Number(val))) {
            const err = new Error(`Field '${field.label || field.name}' must be a valid number`);
            err.statusCode = 400;
            err.code = 'VALIDATION_ERROR';
            throw err;
          }
        }
      }
    }

    // 4. Enrich Geolocation with Fallback Chain
    const geo = await geoService.enrichIp(visitor_ip);

    // 5. Commit to PostgreSQL (derive tenant_id strictly from widget.tenant_id)
    const insertRes = await query(
      `INSERT INTO submissions (
         widget_id, tenant_id, payload, visitor_ip, user_agent,
         country_code, country_name, city, geo_provider, geo_status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, widget_id, tenant_id, payload, visitor_ip, country_code, country_name, city, geo_provider, geo_status, created_at`,
      [
        widget.id,
        widget.tenant_id,
        JSON.stringify(payload),
        visitor_ip,
        user_agent || null,
        geo.country_code,
        geo.country_name,
        geo.city,
        geo.geo_provider,
        geo.geo_status,
      ]
    );

    const submission = insertRes.rows[0];

    // 6. Asynchronously dispatch safe side effects post-commit
    sideEffectService.dispatchAll(submission, widget);

    return submission;
  }
}

module.exports = new SubmissionService();
