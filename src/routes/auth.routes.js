const express = require('express');
const authController = require('../controllers/auth.controller');
const { validate } = require('../middleware/validate');
const { registerSchema, loginSchema } = require('../validators/auth.validator');

const router = express.Router();

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register a new tenant organization and owner user
 * @access  Public
 */
router.post('/register', validate({ body: registerSchema }), authController.register);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Authenticate user credentials and receive JWT Bearer token
 * @access  Public
 */
router.post('/login', validate({ body: loginSchema }), authController.login);

module.exports = router;
