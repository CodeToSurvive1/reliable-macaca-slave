'use strict';

var co = require('co');
var fs = require('fs');
var path = require('path');
var EOL = require('os').EOL;
var NPM = require('reliable-npm').NPM;
var reliableGit = require('reliable-git');
var spawn = require('child_process').spawn;
var createRunner = require('macaca-cli').Runner;

var analysis = require('./analysis');
var _ = require('../../common/helper');
var Channel = require('../slave/channel');
var logger = require('../../common/logger');
var getServerInfo = require('../server/monitor');

//测试结果集打包依赖
var JSZip = require("jszip");
var request = require('request');
var zip = new JSZip();

// Set the npm repo
var npm = new NPM();

var status = {
  ACK: 'ack',
  AVAILABLE: 'available',
  BUSY: 'busy'
};

var bodyStatus = {
  SUCCESS: 2,
  FAILED: 3
};

var type = {
  ACK: 'ack',
  TASK: 'task'
};

/**
 * Process the task and send the result back when finished
 * @param msg
 */
module.exports = co.wrap(function *(msg, options) {
  var channel = Channel.getInstance();
  var basicData = {
    type: type.TASK,
    serialNumber: msg.serialNumber,
    taskId: msg.taskId
  };

  var finalResult = '';
  var hasError = false;
  var gitResult = '';

  try {

    // Create the temp directory according to taskId
    var tempDir = path.join(__dirname, '..', '..', '.temp', msg.taskId);

    if (fs.existsSync(tempDir)) {
      _.rimraf(tempDir);
    }
    _.mkdir(tempDir);

    var logResult = [];
    logger.debug('Task %s start git clone...', msg.taskId);

    console.log(msg);

    // Git clone the repo
    var _body = msg.body.trim();

    var gitRepo = yield Promise.race([
      reliableGit.clone({
        repo: _body.split('#')[0],
        branch: _body.split('#')[1],
        dir: tempDir
      }),
      _.timeoutPromise(600, 'Git clone timeout for 10mins')
    ]);
    gitResult = yield gitRepo.latestCommitInfo();

    logger.debug('Task %s start git clone success!', msg.taskId);

    // Npm install the modules
    logger.debug('Task %s start npm install...', msg.taskId);
    yield Promise.race([
      npm.install({
        registry: options.registry,
        cwd: tempDir,
        timeout: 10 * 60 * 1000 // kill after timeout
      }),
      _.timeoutPromise(600, 'Npm install timeout for 10mins')
    ]);
    logger.debug('Task %s npm install success!', msg.taskId);

    data = _.merge(basicData, {
      sysInfo: getServerInfo(),
      status: status.BUSY,
      body: logResult.join(EOL)
    });

    channel.send(data);

    logger.debug('Sending %s data...', msg.taskId);

    var env = {};
    var envFromServer = _body.split('#')[2];

    if (envFromServer) {
      envFromServer = envFromServer.split(',');
      envFromServer.forEach(function(item) {
        var key = item.split('=')[0];
        var value = item.split('=')[1];
        env[key] = value;
      });
    }

    env['CUSTOM_DIR'] = tempDir+'\\macaca-logs\\macaca-mobile-sample';
    // Run thels test and return a stream.
    var runner = createRunner({
      cwd: tempDir,
      directory: 'macaca-test',
      reporter:'macaca-simple-reportor',
      output:tempDir+'\\macaca-logs\\log.html',
      env: env,
      colors: true,
      framework: 'mocha'
    });

    // Send the result back immediately when receiving data.
    runner.on('data', function(data) {
      logger.debug('Sending %s data ...', msg.taskId);
      data += EOL;
      finalResult += data;

      var result = _.merge(basicData, {
        sysInfo: getServerInfo(),
        status: status.BUSY,
        body: data
      });

      channel.send(result);
    });

    runner.on('error', function(data) {
      data += EOL;

      logger.debug('Sending %s error data...', msg.taskId);
      finalResult += data;
      hasError = true;

      var result = _.merge(basicData, {
        sysInfo: getServerInfo(),
        status: status.BUSY,
        body: data
      });

      channel.send(result);
    });

    // Send the final result back with the analysis.
    runner.on('close', function() {
      // Change the status to available after the task.
      var path = tempDir+'\\macaca-logs\\macaca-mobile-sample\\screenshot';
      var logData = fs.readFileSync(tempDir+'\\macaca-logs\\macaca-mobile-sample\\result.log','utf-8');
      var log = zip.folder("macaca-mobile-sample");
      log.file("result.log", logData);
      //log.file("result.log", imgData, {base64: true});

      var img = zip.folder("macaca-mobile-sample\\screenshot");

      var imgData;
       fs.readdir(path, function(err, files){
      	for(var i=0;i<files.length;i++){
      		console.log(files[i]);
      		imgData = fs.readFileSync(path+'\\'+files[i],'base64');
      		img.file(files[i], imgData, {base64: true});
      	}
      	zip
      	.generateNodeStream({type:'nodebuffer',streamFiles:true})
      	.pipe(fs.createWriteStream(tempDir+"\\"+msg.taskId+".zip"))
      	.on('finish', function () {
      		// JSZip generates a readable stream with a "end" event,
      		// but is piped here in a writable stream which emits a "finish" event.
          var resultFile=tempDir+'\\'+msg.taskId+'.zip';
          var formData = {
                        // my_field: 'my_value',
                  my_buffer: new Buffer([1, 2, 3]),
                  attachments: [
                  fs.createReadStream(resultFile)
                    ],
                };

          request.post({ url: 'http://localhost:3333/api/matc/result', formData: formData }, function optionalCallback(err, httpResponse, body) {
          if (err) {
              return console.error('上传结果到业务系统失败:', err,resultFile);
              }
             console.log('上传结果到业务系统成功:', resultFile);
          });
      		console.log("out.zip written.");
      	});
      });
      global.__task_status = status.AVAILABLE;

      var execInfo = analysis(finalResult);
      var runnerStatus = hasError ? bodyStatus.FAILED : execInfo.status;

      var result = _.merge(basicData, {
        sysInfo: getServerInfo(),
        status: status.AVAILABLE,
        bodyStatus: runnerStatus,
        extra: _.merge(execInfo, {
          description: gitResult
        }),
        body: 'false'
      });

      logger.debug('Done task %s data...', msg.taskId);
      channel.send(result);




    });

  } catch (e) {
    hasError = true;

    // Change the status to available when error happens.
    global.__task_status = status.AVAILABLE;

    logger.warn(e.toString());
    logger.debug(e.toString());
    logger.debug('Error during install...');

    // Send the error data back to the server
    var execResult = e.toString().trim();

    var data = _.merge(basicData, {
      sysInfo: getServerInfo(),
      status: status.BUSY,
      body: execResult
    });

    logger.debug('Sending %s error data...', msg.taskId);

    channel.send(data);

    // Send the close info to server
    data = _.merge(basicData, {
      sysInfo: getServerInfo(),
      status: status.AVAILABLE,
      bodyStatus: 3,
      extra: {
        description: gitResult
      },
      body: 'false'
    });

    logger.debug('Done task %s data...', msg.taskId);

    setTimeout(function() {
      channel.send(data);
    }, 3000);
  }
});
