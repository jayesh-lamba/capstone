const widgetService = require('../services/widget.service');

class WidgetController {
  async list(req, res, next) {
    try {
      const data = await widgetService.listWidgets(req.user.tenantId);
      res.status(200).json({
        status: 'success',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async get(req, res, next) {
    try {
      const data = await widgetService.getWidget(req.user.tenantId, req.params.id);
      res.status(200).json({
        status: 'success',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async create(req, res, next) {
    try {
      const data = await widgetService.createWidget(req.user.tenantId, req.body);
      res.status(201).json({
        status: 'success',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async update(req, res, next) {
    try {
      const data = await widgetService.updateWidget(req.user.tenantId, req.params.id, req.body);
      res.status(200).json({
        status: 'success',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async remove(req, res, next) {
    try {
      await widgetService.deleteWidget(req.user.tenantId, req.params.id);
      res.status(200).json({
        status: 'success',
        message: 'Widget deleted successfully',
      });
    } catch (err) {
      next(err);
    }
  }

  async getSnippet(req, res, next) {
    try {
      const data = await widgetService.getSnippet(req.user.tenantId, req.params.id);
      res.status(200).json({
        status: 'success',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async getConfig(req, res, next) {
    try {
      const data = await widgetService.getPublicConfig(req.params.id);
      
      // Set short-lived caching headers with stale-while-revalidate
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=120');
      
      return res.status(200).json({
        status: 'success',
        data,
        ...data,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new WidgetController();

