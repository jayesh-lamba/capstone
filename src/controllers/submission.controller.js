const submissionService = require('../services/submission.service');

class SubmissionController {
  /**
   * Handle CORS preflight OPTIONS request
   */
  handlePreflight(req, res) {
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With');
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(204).end();
  }

  /**
   * Handle public form lead submission
   */
  async submit(req, res, next) {
    try {
      const visitorIp =
        req.headers['x-forwarded-for']?.split(',')[0].trim() ||
        req.socket.remoteAddress ||
        '127.0.0.1';

      const userAgent = req.headers['user-agent'];
      const origin = req.headers.origin;

      const submission = await submissionService.createSubmission({
        widget_id: req.body.widget_id,
        payload: req.body.payload,
        visitor_ip: visitorIp,
        user_agent: userAgent,
        origin,
      });

      // Set CORS headers on public response
      const allowOrigin = origin || '*';
      res.setHeader('Access-Control-Allow-Origin', allowOrigin);

      return res.status(201).json({
        status: 'success',
        message: 'Submission recorded successfully',
        data: {
          submission_id: submission.id,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new SubmissionController();
