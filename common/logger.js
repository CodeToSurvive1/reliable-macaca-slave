/* ================================================================
 * reliable-slave by xdf(xudafeng[at]126.com)
 *
 * first created at : Tue Mar 17 2015 00:16:10 GMT+0800 (CST)
 *
 * ================================================================
 * Copyright 2013 xdf
 *
 * Licensed under the MIT License
 * You may not use this file except in compliance with the License.
 *
 * ================================================================ */

'use strict';

var path = require('path');
var logger = require('reliable-logger');

var options = {
  logFileDir: path.join(__dirname, '..', 'logs')
};

module.exports = logger.Logger(options);
module.exports.middleware = logger.middleware(options);
