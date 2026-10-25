const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool, query } = require('../db');
const config = require('../config');

class AuthService {
  /**
   * Register a new tenant and owner user inside a database transaction.
   *
   * @param {Object} params
   * @param {string} params.tenant_name
   * @param {string} params.email
   * @param {string} params.password
   * @returns {Promise<{ user_id: string, tenant_id: string, email: string, token: string }>}
   */
  async register({ tenant_name, email, password }) {
    // 1. Check if user email already exists
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      const err = new Error('User with this email already exists');
      err.statusCode = 409;
      err.code = 'EMAIL_ALREADY_EXISTS';
      throw err;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 2. Create the tenant
      const tenantRes = await client.query(
        'INSERT INTO tenants (name, plan) VALUES ($1, $2) RETURNING id',
        [tenant_name, 'standard']
      );
      const tenantId = tenantRes.rows[0].id;

      // 3. Hash the password
      const passwordHash = await bcrypt.hash(password, 10);

      // 4. Create the owner user
      const userRes = await client.query(
        `INSERT INTO users (tenant_id, email, password_hash, role)
         VALUES ($1, $2, $3, $4)
         RETURNING id, tenant_id, email, role`,
        [tenantId, email, passwordHash, 'owner']
      );
      const user = userRes.rows[0];

      await client.query('COMMIT');

      // 5. Generate signed JWT token
      const token = jwt.sign(
        {
          userId: user.id,
          tenantId: user.tenant_id,
          role: user.role,
        },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      return {
        user_id: user.id,
        tenant_id: user.tenant_id,
        email: user.email,
        token,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Authenticate a user and issue a JWT token.
   *
   * @param {Object} params
   * @param {string} params.email
   * @param {string} params.password
   * @returns {Promise<{ token: string, tenant_id: string }>}
   */
  async login({ email, password }) {
    const res = await query(
      'SELECT id, tenant_id, email, password_hash, role FROM users WHERE email = $1',
      [email]
    );

    const user = res.rows[0];
    if (!user) {
      const err = new Error('Invalid email or password');
      err.statusCode = 401;
      err.code = 'INVALID_CREDENTIALS';
      throw err;
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      const err = new Error('Invalid email or password');
      err.statusCode = 401;
      err.code = 'INVALID_CREDENTIALS';
      throw err;
    }

    const token = jwt.sign(
      {
        userId: user.id,
        tenantId: user.tenant_id,
        role: user.role,
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    return {
      token,
      tenant_id: user.tenant_id,
    };
  }
}

module.exports = new AuthService();
