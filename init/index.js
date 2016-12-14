'use strict';

var co = require('co');
var os = require('os');
var koa = require('koa');
var path = require('path');
var cluster = require('cluster');
var program = require('commander');

var _ = require('../common/helper');
var logger = require('../common/logger');

var options = {
  webPort: 8080,
  verbose: false,
  ios: false,
  port: 4000,
  registry: 'http://registry.npmjs.org'
};

program
  .option('-p, --port <d>',       `set port for server (default: ${options.port})`)
  .option('-r, --registry <s>',   'set registry for node')
  .option('-m, --master <s>',     'register to pointed master')
  .option('--ios',                `marking whether slave support iOS device (default is ${options.ios}) `)
  .option('--verbose',            'show more debugging information')
  .parse(process.argv);

_.merge(options, _.getConfig(program));

module.exports = function() {
  var clusterId = 0;
  var worker = path.join(__dirname, 'worker.js');
  console.log('***************************************');
  console.log(process.argv);
  console.log('***************************************');
  cluster.setupMaster({
    exec: worker,
    args: process.argv,
    silent: false
  });

  var start = function() {
    cluster.fork();
    clusterId++;
    cluster.workers[clusterId].on('message', function(e) {
      switch (e.message) {
        case 'killMaster':
          process.exit(-1);
          break;
      }
    });
    cluster.workers[clusterId].send({
      message: 'startServer',
      data: options
    });
  };

  cluster
    .on('fork', function() {
      logger.debug('worker fork success');
    })
    .on('online', function() {
      logger.debug('worker online');
    })
    .on('listening', function(worker, address) {
      logger.debug('listening worker id: %d, pid: %d, address: %s:%s', worker.id, worker.process.pid, _.ipv4, address.port);
    })
    .on('disconnect', function() {
      logger.debug('worker disconnect');
      start();
    })
    .on('exit', function(worker, code, signal) {
      logger.debug('worker exit code: %s signal: %s', code, signal || 'null');
    });
  start();
};
