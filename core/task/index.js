'use strict';

const flow = require('./flow');
const Channel = require('../slave/channel');
const logger = require('../../common/logger');
const getServerInfo = require('../server/monitor');

// Machine status
const status = {
  ACK: 'ack',
  AVAILABLE: 'available',
  BUSY: 'busy'
};

// Message type
const type = {
  ACK: 'ack',
  TASK: 'task'
};

const isBusy = () => global.__task_status === status.BUSY;

module.exports = function *(msg, options) {
  logger.info('Coming to processor...');

  // Only process one task at the same time.
  if (isBusy()) {
    logger.info('Processing...no more work!');
    return;
  }

  // global.__task_status = status.BUSY;

  const channel = Channel.getInstance();
  // Change the machine status to busy and notify master
  channel.send({
    type: type.TASK,
    serialNumber: msg.serialNumber,
    taskId: msg.taskId,
    sysInfo: getServerInfo(),
    status: status.BUSY,
    body: ''
  });

  yield flow(msg, options);
};
