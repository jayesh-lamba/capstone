const express = require('express');
const submissionController = require('../controllers/submission.controller');
const { submissionRateLimiter } = require('../middleware/rateLimiter');
const { spamProtection } = require('../middleware/spamProtection');
const { validate } = require('../middleware/validate');
const { submissionSchema } = require('../validators/submission.validator');

const router = express.Router();

/**
 * @route   OPTIONS /api/v1/submissions
 * @desc    CORS preflight handling
 * @access  Public
 */
router.options('/', submissionController.handlePreflight);

/**
 * @route   POST /api/v1/submissions
 * @desc    Public form submission with boundary validation, rate limiting, and spam defense
 * @access  Public
 */
router.post(
  '/',
  submissionRateLimiter,
  spamProtection,
  validate({ body: submissionSchema }),
  submissionController.submit
);

module.exports = router;
