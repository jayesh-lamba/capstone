const { query } = require('../db');

class DashboardService {
  /**
   * Retrieve paginated submissions for the authenticated tenant.
   *
   * @param {string} tenantId
   * @param {Object} options
   * @param {number} [options.page=1]
   * @param {number} [options.limit=20]
   * @param {string} [options.widget_id]
   * @param {string} [options.search]
   * @param {string} [options.start_date]
   * @param {string} [options.end_date]
   * @returns {Promise<{ submissions: Array, pagination: Object }>}
   */
  async getSubmissions(tenantId, options = {}) {
    const page = Math.max(1, parseInt(options.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(options.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const conditions = ['s.tenant_id = $1'];
    const params = [tenantId];
    let paramIndex = 2;

    if (options.widget_id) {
      conditions.push(`s.widget_id = $${paramIndex}`);
      params.push(options.widget_id);
      paramIndex++;
    }

    if (options.search) {
      conditions.push(
        `(s.payload::text ILIKE $${paramIndex} OR s.country_name ILIKE $${paramIndex} OR s.city ILIKE $${paramIndex} OR s.visitor_ip ILIKE $${paramIndex})`
      );
      params.push(`%${options.search}%`);
      paramIndex++;
    }

    if (options.start_date) {
      conditions.push(`s.created_at >= $${paramIndex}`);
      params.push(new Date(options.start_date).toISOString());
      paramIndex++;
    }

    if (options.end_date) {
      conditions.push(`s.created_at <= $${paramIndex}`);
      params.push(new Date(options.end_date).toISOString());
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Total count query for pagination
    const countSql = `SELECT COUNT(*)::int AS total FROM submissions s WHERE ${whereClause}`;
    const countRes = await query(countSql, params);
    const total = countRes.rows[0]?.total || 0;

    // Fetch paginated submissions with stable deterministic sorting
    const dataSql = `
      SELECT 
        s.id,
        s.widget_id,
        w.title AS widget_title,
        s.payload,
        s.visitor_ip,
        s.country_code,
        s.country_name,
        s.city,
        s.geo_provider,
        s.geo_status,
        s.created_at
      FROM submissions s
      LEFT JOIN widgets w ON s.widget_id = w.id
      WHERE ${whereClause}
      ORDER BY s.created_at DESC, s.id DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const dataParams = [...params, limit, offset];
    const dataRes = await query(dataSql, dataParams);

    return {
      submissions: dataRes.rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Retrieve submission volume timeseries and KPI metrics for tenant.
   *
   * @param {string} tenantId
   * @param {Object} options
   * @param {string} [options.widget_id]
   * @param {string} [options.timeframe='7d']
   * @param {string} [options.start_date]
   * @param {string} [options.end_date]
   * @returns {Promise<Object>}
   */
  async getStats(tenantId, options = {}) {
    const conditions = ['s.tenant_id = $1'];
    const params = [tenantId];
    let paramIndex = 2;

    if (options.widget_id) {
      conditions.push(`s.widget_id = $${paramIndex}`);
      params.push(options.widget_id);
      paramIndex++;
    }

    // Determine date boundaries
    let startDate;
    let endDate = options.end_date ? new Date(options.end_date) : new Date();

    if (options.start_date) {
      startDate = new Date(options.start_date);
    } else {
      const days = options.timeframe === '90d' ? 90 : (options.timeframe === '30d' ? 30 : 7);
      startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
    }

    conditions.push(`s.created_at >= $${paramIndex}`);
    params.push(startDate.toISOString());
    paramIndex++;

    conditions.push(`s.created_at <= $${paramIndex}`);
    params.push(endDate.toISOString());
    paramIndex++;

    const whereClause = conditions.join(' AND ');

    // 1. Total submissions in period
    const totalSql = `SELECT COUNT(*)::int AS total FROM submissions s WHERE ${whereClause}`;
    const totalRes = await query(totalSql, params);
    const totalSubmissions = totalRes.rows[0]?.total || 0;

    // 2. Total active widgets owned by tenant
    const widgetsSql = `
      SELECT COUNT(*)::int AS count 
      FROM widgets 
      WHERE tenant_id = $1 AND is_active = true
    `;
    const widgetsRes = await query(widgetsSql, [tenantId]);
    const activeWidgets = widgetsRes.rows[0]?.count || 0;

    // 3. Daily submissions over time
    const timeseriesSql = `
      SELECT 
        TO_CHAR(DATE_TRUNC('day', s.created_at), 'YYYY-MM-DD') AS date,
        COUNT(*)::int AS count
      FROM submissions s
      WHERE ${whereClause}
      GROUP BY DATE_TRUNC('day', s.created_at)
      ORDER BY DATE_TRUNC('day', s.created_at) ASC
    `;
    const timeseriesRes = await query(timeseriesSql, params);

    return {
      total_submissions: totalSubmissions,
      unique_widgets_active: activeWidgets,
      submissions_over_time: timeseriesRes.rows,
    };
  }

  /**
   * Retrieve geographic distribution aggregation of submissions.
   *
   * @param {string} tenantId
   * @param {Object} options
   * @param {string} [options.widget_id]
   * @returns {Promise<Array<Object>>}
   */
  async getGeoBreakdown(tenantId, options = {}) {
    const conditions = ['tenant_id = $1'];
    const params = [tenantId];

    if (options.widget_id) {
      conditions.push('widget_id = $2');
      params.push(options.widget_id);
    }

    const whereClause = conditions.join(' AND ');

    const sql = `
      SELECT 
        COALESCE(country_code, 'Unknown') AS country_code,
        COALESCE(country_name, 'Unknown') AS country_name,
        COUNT(*)::int AS count,
        ROUND((COUNT(*) * 100.0 / NULLIF(SUM(COUNT(*)) OVER(), 0))::numeric, 1)::float AS percentage
      FROM submissions
      WHERE ${whereClause}
      GROUP BY country_code, country_name
      ORDER BY count DESC
      LIMIT 20
    `;

    const res = await query(sql, params);
    return res.rows;
  }
}

module.exports = new DashboardService();
