const express = require('express');
const dashboardController = require('../controllers/dashboard.controller');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  submissionsQuerySchema,
  statsQuerySchema,
  geoQuerySchema,
} = require('../validators/dashboard.validator');

const router = express.Router();

// Enforce JWT authentication on all dashboard endpoints
router.use(authenticate);

/**
 * @route   GET /api/v1/dashboard/submissions
 * @desc    Paginated submissions with filtering and search
 * @access  Private (Bearer JWT)
 */
router.get(
  '/submissions',
  validate({ query: submissionsQuerySchema }),
  dashboardController.getSubmissions
);

/**
 * @route   GET /api/v1/dashboard/stats
 * @desc    Aggregated submission timeseries metrics and KPI summary
 * @access  Private (Bearer JWT)
 */
router.get(
  '/stats',
  validate({ query: statsQuerySchema }),
  dashboardController.getStats
);

/**
 * @route   GET /api/v1/dashboard/geo
 * @desc    Geographic breakdown metrics of submissions
 * @access  Private (Bearer JWT)
 */
router.get(
  '/geo',
  validate({ query: geoQuerySchema }),
  dashboardController.getGeo
);

module.exports = router;
