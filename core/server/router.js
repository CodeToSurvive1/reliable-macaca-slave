'use strict';

var controllers = require('../../web/controllers');

module.exports = function(app) {
  app.get('/', controllers.home);

  app.get('/devices', controllers.devices);

};
