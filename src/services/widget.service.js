const { query } = require('../db');
const config = require('../config');

class WidgetService {
  /**
   * List all widgets belonging to the authenticated tenant.
   *
   * @param {string} tenantId
   * @returns {Promise<Array<Object>>}
   */
  async listWidgets(tenantId) {
    const res = await query(
      `SELECT 
         w.id,
         w.name,
         w.type,
         w.title,
         w.description,
         w.button_text,
         w.fields_schema,
         w.display_rules,
         w.is_active,
         w.created_at,
         w.updated_at,
         COALESCE(COUNT(s.id), 0)::int AS submission_count
       FROM widgets w
       LEFT JOIN submissions s ON s.widget_id = w.id
       WHERE w.tenant_id = $1
       GROUP BY w.id
       ORDER BY w.created_at DESC`,
      [tenantId]
    );

    return res.rows;
  }

  /**
   * Retrieve a specific widget ensuring tenant isolation.
   *
   * @param {string} tenantId
   * @param {string} widgetId
   * @returns {Promise<Object>}
   */
  async getWidget(tenantId, widgetId) {
    const res = await query(
      `SELECT 
         w.id,
         w.name,
         w.type,
         w.title,
         w.description,
         w.button_text,
         w.fields_schema,
         w.display_rules,
         w.is_active,
         w.created_at,
         w.updated_at,
         COALESCE(COUNT(s.id), 0)::int AS submission_count
       FROM widgets w
       LEFT JOIN submissions s ON s.widget_id = w.id
       WHERE w.id = $1 AND w.tenant_id = $2
       GROUP BY w.id`,
      [widgetId, tenantId]
    );

    const widget = res.rows[0];
    if (!widget) {
      const err = new Error('Widget not found');
      err.statusCode = 404;
      err.code = 'WIDGET_NOT_FOUND';
      throw err;
    }

    return widget;
  }

  /**
   * Create a new widget under the authenticated tenant.
   *
   * @param {string} tenantId
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async createWidget(tenantId, data) {
    const {
      name,
      type = 'signup_form',
      title,
      description = '',
      button_text = 'Submit',
      fields_schema,
      display_rules = {},
      is_active = true,
    } = data;

    const res = await query(
      `INSERT INTO widgets (
         tenant_id, name, type, title, description, button_text, fields_schema, display_rules, is_active
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        tenantId,
        name,
        type,
        title,
        description,
        button_text,
        JSON.stringify(fields_schema),
        JSON.stringify(display_rules),
        is_active,
      ]
    );

    const created = res.rows[0];
    const embedSnippet = `<script src="${config.baseUrl}/widget.v1.js?id=${created.id}" defer></script>`;

    return {
      ...created,
      embed_snippet: embedSnippet,
    };
  }

  /**
   * Update an existing widget, strictly checking tenant ownership.
   *
   * @param {string} tenantId
   * @param {string} widgetId
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async updateWidget(tenantId, widgetId, data) {
    // Check existence first
    await this.getWidget(tenantId, widgetId);

    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    const allowedFields = [
      'name',
      'type',
      'title',
      'description',
      'button_text',
      'fields_schema',
      'display_rules',
      'is_active',
    ];

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        setClauses.push(`${field} = $${paramIndex}`);
        const val =
          field === 'fields_schema' || field === 'display_rules'
            ? JSON.stringify(data[field])
            : data[field];
        values.push(val);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) {
      return await this.getWidget(tenantId, widgetId);
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(widgetId);
    values.push(tenantId);

    const sql = `
      UPDATE widgets
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
      RETURNING *
    `;

    const res = await query(sql, values);
    return res.rows[0];
  }

  /**
   * Delete a widget, strictly scoped to tenant.
   *
   * @param {string} tenantId
   * @param {string} widgetId
   * @returns {Promise<{ id: string, deleted: boolean }>}
   */
  async deleteWidget(tenantId, widgetId) {
    const res = await query(
      'DELETE FROM widgets WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [widgetId, tenantId]
    );

    if (res.rows.length === 0) {
      const err = new Error('Widget not found');
      err.statusCode = 404;
      err.code = 'WIDGET_NOT_FOUND';
      throw err;
    }

    return { id: widgetId, deleted: true };
  }

  /**
   * Generate the embed snippet for a widget.
   *
   * @param {string} tenantId
   * @param {string} widgetId
   * @returns {Promise<{ widget_id: string, embed_snippet: string }>}
   */
  async getSnippet(tenantId, widgetId) {
    const widget = await this.getWidget(tenantId, widgetId);
    return {
      widget_id: widget.id,
      embed_snippet: `<script src="${config.baseUrl}/widget.v1.js?id=${widget.id}" defer></script>`,
    };
  }

  /**
   * Retrieve public widget configuration for client form rendering.
   * Excludes tenant IDs, credentials, internal fields, and submission data.
   * Returns consistent 404 for missing or inactive widgets.
   *
   * @param {string} widgetId
   * @returns {Promise<Object>}
   */
  async getPublicConfig(widgetId) {
    const res = await query(
      `SELECT id, type, title, description, button_text, fields_schema, display_rules, is_active
       FROM widgets
       WHERE id = $1`,
      [widgetId]
    );

    if (res.rows.length === 0 || !res.rows[0].is_active) {
      const err = new Error('Widget not found');
      err.statusCode = 404;
      err.code = 'WIDGET_NOT_FOUND';
      throw err;
    }

    const row = res.rows[0];

    return {
      id: row.id,
      type: row.type,
      title: row.title,
      description: row.description,
      button_text: row.button_text,
      fields: row.fields_schema,
      display: {
        position: row.display_rules?.position || 'bottom-right',
        theme_color: row.display_rules?.theme_color || '#2563eb',
      },
    };
  }
}

module.exports = new WidgetService();

