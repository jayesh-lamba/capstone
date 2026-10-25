const express = require('express');
const widgetController = require('../controllers/widget.controller');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  widgetParamSchema,
  createWidgetSchema,
  updateWidgetSchema,
} = require('../validators/widget.validator');

const router = express.Router();

/**
 * @route   GET /api/v1/widgets/:id/config
 * @desc    Public dynamic widget configuration for client form rendering
 * @access  Public (CORS Enabled, Short-lived Caching)
 */
router.get(
  '/:id/config',
  validate({ params: widgetParamSchema }),
  widgetController.getConfig
);

// Enforce JWT authentication on all widget management endpoints below
router.use(authenticate);

/**
 * @route   GET /api/v1/widgets
 * @desc    List all widgets for the authenticated tenant
 * @access  Private (Bearer JWT)
 */
router.get('/', widgetController.list);

/**
 * @route   POST /api/v1/widgets
 * @desc    Create a new widget under authenticated tenant
 * @access  Private (Bearer JWT)
 */
router.post('/', validate({ body: createWidgetSchema }), widgetController.create);

/**
 * @route   GET /api/v1/widgets/:id/snippet
 * @desc    Retrieve embed snippet for a widget
 * @access  Private (Bearer JWT)
 */
router.get('/:id/snippet', validate({ params: widgetParamSchema }), widgetController.getSnippet);

/**
 * @route   GET /api/v1/widgets/:id
 * @desc    Get details of a specific widget
 * @access  Private (Bearer JWT)
 */
router.get('/:id', validate({ params: widgetParamSchema }), widgetController.get);

/**
 * @route   PUT /api/v1/widgets/:id
 * @desc    Update a widget definition
 * @access  Private (Bearer JWT)
 */
router.put(
  '/:id',
  validate({ params: widgetParamSchema, body: updateWidgetSchema }),
  widgetController.update
);

/**
 * @route   DELETE /api/v1/widgets/:id
 * @desc    Delete a widget
 * @access  Private (Bearer JWT)
 */
router.delete('/:id', validate({ params: widgetParamSchema }), widgetController.remove);

module.exports = router;
