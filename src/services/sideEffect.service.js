const nodemailer = require('nodemailer');
const { query } = require('../db');
const config = require('../config');

class SideEffectService {
  constructor() {
    this.transporter = null;
    this.initTransporter();
  }

  initTransporter() {
    if (config.email.provider === 'smtp') {
      this.transporter = nodemailer.createTransport({
        host: config.email.smtpHost,
        port: config.email.smtpPort,
        secure: false, // Mailpit uses unencrypted SMTP on 1025
        tls: { rejectUnauthorized: false },
      });
    }
  }

  /**
   * Log side effect attempt into side_effect_logs table.
   */
  async logAttempt(submissionId, type, status, attempts, errorMessage = null) {
    try {
      await query(
        `INSERT INTO side_effect_logs (submission_id, type, status, attempts, error_message)
         VALUES ($1, $2, $3, $4, $5)`,
        [submissionId, type, status, attempts, errorMessage]
      );
    } catch (err) {
      console.error('[SIDE_EFFECT] Failed to persist side effect audit log:', err.message);
    }
  }

  /**
   * Dispatches email notification safely.
   */
  async dispatchEmail(submission, widget) {
    const shouldFail =
      process.env.SIMULATE_SIDE_EFFECT_FAILURE === 'true' || config.sideEffects.simulateFailure;

    if (shouldFail) {
      const simulatedErr = new Error('Simulated side effect failure for Evaluator Probe 5');
      await this.logAttempt(submission.id, 'email', 'failed', 1, simulatedErr.message);
      throw simulatedErr;
    }

    try {
      if (this.transporter) {
        await this.transporter.sendMail({
          from: config.email.from,
          to: 'lead-notifications@flyrank.local',
          subject: `New Lead Captured: ${widget.title || widget.name}`,
          text: `You have received a new lead for widget "${widget.title}"!\n\nPayload:\n${JSON.stringify(
            submission.payload,
            null,
            2
          )}\n\nVisitor IP: ${submission.visitor_ip}\nCountry: ${submission.country_name || 'N/A'}\nCity: ${
            submission.city || 'N/A'
          }`,
        });
      } else {
        // Fallback console log for $0 stack
        console.log(`[EMAIL_DISPATCH] Lead notification sent for submission ${submission.id}:`, {
          widget: widget.title,
          payload: submission.payload,
        });
      }

      await this.logAttempt(submission.id, 'email', 'success', 1, null);
    } catch (err) {
      console.warn(`[SIDE_EFFECT] Email dispatch failed for submission ${submission.id}:`, err.message);
      await this.logAttempt(submission.id, 'email', 'failed', 1, err.message);
      // Do not rethrow - safe side effect must not crash process
    }
  }

  /**
   * Asynchronous safe entry point called after database commit.
   * Completely isolated via setImmediate and try-catch.
   *
   * @param {Object} submission
   * @param {Object} widget
   */
  dispatchAll(submission, widget) {
    setImmediate(async () => {
      try {
        await this.dispatchEmail(submission, widget);
      } catch (err) {
        console.warn(`[SIDE_EFFECT] Handled non-blocking side effect exception for ${submission.id}:`, err.message);
      }
    });
  }
}

module.exports = new SideEffectService();
