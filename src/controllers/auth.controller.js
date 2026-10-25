const authService = require('../services/auth.service');

class AuthController {
  async register(req, res, next) {
    try {
      const data = await authService.register(req.body);
      res.status(201).json({
        status: 'success',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async login(req, res, next) {
    try {
      const data = await authService.login(req.body);
      res.status(200).json({
        status: 'success',
        data,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new AuthController();
