/**
 * Spam Protection Middleware
 * 1. Checks hidden honeypot trap field (_hp_company)
 * 2. Checks submission velocity (_rendered_at < 1000ms duration)
 */
function spamProtection(req, res, next) {
  const { _hp_company, _rendered_at } = req.body || {};

  // 1. Honeypot Field Trap
  // Real humans cannot see or fill this input due to CSS concealment.
  // Any non-empty value indicates an automated crawler or autofill bot.
  if (_hp_company !== undefined && _hp_company !== null) {
    const valStr = String(_hp_company).trim();
    if (valStr.length > 0) {
      return res.status(400).json({
        status: 'error',
        code: 'SPAM_DETECTED',
        error: {
          code: 'SPAM_DETECTED',
          message: 'Submission rejected by bot defense filter.',
        },
      });
    }
  }

  // 2. Submission Timing Heuristic
  // Real human users take at least 1.5 - 3 seconds to view and submit a form.
  // Submissions completing in under 1000ms, negative duration, or future timestamps are flagged.
  if (_rendered_at !== undefined && _rendered_at !== null) {
    const renderedTimestamp = Number(_rendered_at);
    if (isNaN(renderedTimestamp) || renderedTimestamp <= 0) {
      return res.status(400).json({
        status: 'error',
        code: 'INVALID_TIMESTAMP',
        error: {
          code: 'INVALID_TIMESTAMP',
          message: 'Submission rejected: Invalid render timestamp.',
        },
      });
    }

    const now = Date.now();
    // Guard against future timestamps (allowing 1000ms clock skew)
    if (renderedTimestamp > now + 1000) {
      return res.status(400).json({
        status: 'error',
        code: 'INVALID_TIMESTAMP',
        error: {
          code: 'INVALID_TIMESTAMP',
          message: 'Submission rejected: Form timestamp cannot be in the future.',
        },
      });
    }

    const elapsedMs = now - renderedTimestamp;
    if (elapsedMs < 1000) {
      return res.status(400).json({
        status: 'error',
        code: 'SUBMISSION_TOO_FAST',
        error: {
          code: 'SUBMISSION_TOO_FAST',
          message: 'Submission rejected: Form submitted too quickly (< 1000ms elapsed).',
        },
      });
    }
  }

  next();
}

module.exports = { spamProtection };
