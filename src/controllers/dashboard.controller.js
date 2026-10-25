const dashboardService = require('../services/dashboard.service');

class DashboardController {
  async getSubmissions(req, res, next) {
    try {
      const data = await dashboardService.getSubmissions(req.user.tenantId, req.query);
      return res.status(200).json({
        status: 'success',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async getStats(req, res, next) {
    try {
      const data = await dashboardService.getStats(req.user.tenantId, req.query);
      return res.status(200).json({
        status: 'success',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async getGeo(req, res, next) {
    try {
      const data = await dashboardService.getGeoBreakdown(req.user.tenantId, req.query);
      return res.status(200).json({
        status: 'success',
        data,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new DashboardController();
