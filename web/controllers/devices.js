'use strict';

var pkg = require('../../package.json');
var logger = require('../../common/logger');
var cp = require('child_process');
var os = require('os');
var Promise = require('bluebird')
var adb = require('adbkit')
var client = adb.createClient()


function *getDeviceList() {
    var arrDeviceList = [];
    var iosDevices = [];
    var strText, match;
    var platform = os.platform();
    yield client.listDevices()
        .then(function (devices) {
            return Promise.filter(devices, function (device) {
                return client.getProperties(device.id)
                    .then(function (properties) {
                        strText = cp.execSync('adb -s ' + device.id + ' shell wm size').toString();
                        var resolution;

                        strText.replace(/Physical size:(.+?)\s+\r?\n/g, function (all, devicesName) {
                            resolution = devicesName.toString().trim();
                        });

                        arrDeviceList.push({
                            serialNumber: device.id,
                            model: properties['ro.product.model'],
                            brand: properties['ro.product.brand'],
                            releaseVersion: properties['ro.build.version.release'],
                            sdkVersion: properties['ro.build.version.sdk'],
                            abi: properties['ro.product.cpu.abi'],
                            product: properties['ro.product.name'],
                            screen: resolution,
                            plantForm: 'Android',
                            status: '1'
                        });
                    }).catch(function (err) {
                        arrDeviceList.push({
                            errorMessage: err.stack,
                            status: '4'
                        });
                    }).then(function (property) {

                    })
            })
        })
        .then(function (property) {

        })

    if (platform == 'darwin') {
        strText = cp.execSync('idevice_id -l').toString();
        var arr = strText.toString('ascii').split('\n').map(function (val) {
            return String(val);
        });
        for (var i = 0; i < arr.length; i++) {
            if (arr[i] != '') {
                var devices = cp.execSync('ideviceinfo -u ' + arr[i] + '').toString();
                var devicesArray = devices.toString('ascii').split('\n').filter(function (val) {
                    return val.indexOf('UniqueDeviceID') == 0 ||
                        val.indexOf('DeviceClass') == 0 ||
                        val.indexOf('ProductVersion') == 0 ||
                        val.indexOf('DeviceName') == 0;
                });
                iosDevices.push(devicesArray);
            }
        }
        var list = [];
        var specificData = [];
        if (iosDevices != '') {
            for (var i = 0; i < iosDevices.length; i++) {
                var ss = iosDevices[i];
                var screen = '';
                for (var j = 0; j < ss.length; j++) {
                    var devicesArray = ss[j].toString('ascii').split(',');
                    var sss = devicesArray.toString('ascii').split(':');
                    list.push(sss[1]);
                }
                specificData.push(list);
                list = [];
            }
            var screen = '';
            for (var i = 0; i < specificData.length; i++) {
                var deviceSpecificData = specificData[i];
                arrDeviceList.push({
                    serialNumber: deviceSpecificData[3].trim(),
                    model: 'iPhone 6s', brand: deviceSpecificData[0].trim(),
                    releaseVersion: deviceSpecificData[2].trim(),
                    plantForm: 'ios',
                    screen: '750x1334',
                    status: '1'
                });
            }
        }
    }
    client.exit;
    return arrDeviceList;
}

function *render() {
    var context = yield getDeviceList.call(this);
    this.body = context;
}

function *dispatch() {
    logger.debug('controller devices');
    yield render.call(this);
}

module.exports = dispatch;
