'use strict';

var fs = require('fs');
var path = require('path');
var co = require('co');
var pathUtil = require('../../common/util');
var Promise = require('bluebird');
var util = require('util');
var _ = require('../../common/helper');
var logger = require('../../common/logger');
var adb = require('adbkit');
var client = adb.createClient();
const options = require('../../common/config').get();

var cp = require('child_process');
var request = require('request');


var mongo=require("mongodb");
var host= options.businessUrls.dataSourceAdress;
var port=options.businessUrls.dataSourcePort;
var server=mongo.Server(host,port,{auto_reconnect:true});
var db=new mongo.Db("reliable",server,{safe:true});


var controllers = require('../../web/controllers');
var arrDeviceList =[];
var slaveId =[];
var allDeviceList = [];
var unauthorizedList = [];

var resources = {
    bin: {
        dest: '/data/local/tmp/minicap'
        , comm: 'minicap'
        , mode: 0o755
    }
    , lib: {
        dest: '/data/local/tmp/minicap.so'
        , mode: 0o755
    }
}

function getIPAdress(){
    var interfaces = require('os').networkInterfaces();
    for(var devName in interfaces){
          var iface = interfaces[devName];
          for(var i=0;i<iface.length;i++){
               var alias = iface[i];
               if(alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal){
                     return alias.address;
               }
          }
    }
}


/**
  判断数据库中是否存在该设备
*/

function contains(arr,obj){
  var i = arr.length;
  while(i--){
    if(arr[i].id===obj){

      return true;
    }
  }
  return false;
}







function installMiniCapAndTouch() {
  var result;
    db.open(function (err,db) {
    setInterval(() => {
            co(function*() {
                yield client.listDevices()
                    .then(function (devices) {
                      try {

                        db.collection("devices", function (err,collection) {
                        collection.find().toArray(function(err,docs){
                              if(err){
                                        console.log(err);
                                }
                                allDeviceList=docs;

                              //db.close();
                              })
                            })


                            var OKdevices = [];
                            for (let i = 0; i < devices.length; i++) {
                              if (devices[i].type=='device') {
                                OKdevices.push(devices[i]);
                              }
                            }




                            if(OKdevices==''){

                              for(var j=0;j<allDeviceList.length;j++){
                                db.collection('devices',function(err,collection){

                                collection.update({serialNumber:allDeviceList[j].serialNumber},{$set:{status:4}},{safe:true},function(err,result){

                                });
                                })
                              }

                            }



                      } catch (err) {
                        console.log(err);
                      }
                        return Promise.map(devices, function (device) {
                          if(device.type=='device'){
                            return client.getProperties(device.id)
                                .then(function (properties) {

                                  try {
                                    var address = getIPAdress();

                                    //  db.open(function (err,db) {

                                      db.collection("slaves", function (err,collection) {
                                      collection.find({slaveIp:{$in:[address]}}).toArray(function(err,docs){
                                              if(err){
                                                        console.log(err);
                                                }

                                                slaveId.push(docs[0]._id);

                                              })
                                            })


                                      db.collection("devices", function (err,collection) {
                                        try {

                                          //body...
                                          if(err) throw err;
                                              else{

                                                  collection.find({serialNumber:{$in:[device.id]}}).toArray(function(err,docs){

                                                    if(err) throw  err;
                                                      if (docs==''){
                                                        var strText = cp.execSync('adb -s ' + device.id + ' shell wm size').toString();
                                                        var resolution;

                                                        strText.replace(/Physical size: (.+?)\s+\r?\n/g, function (all, devicesName) {
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
                                                            // screen: resolution,
                                                            plantForm: 'Android',
                                                            status: '1'
                                                        });
                                                        var screen = resolution.split('x');

                                                        var insertData = {"plantForm":arrDeviceList[0].plantForm,
                                                        "screenHeight" :screen[1],
                                                        "screenWidth" : screen[0],
                                                        "abi" :arrDeviceList[0].abi,
                                                        "sdkVersion" : arrDeviceList[0].sdkVersion,
                                                        "releaseVersion" : arrDeviceList[0].releaseVersion,
                                                        "model" : arrDeviceList[0].model,
                                                        "brand" : arrDeviceList[0].brand,
                                                        "serialNumber" : arrDeviceList[0].serialNumber,
                                                        "status" : 1,
                                                        "slaveId":slaveId[0].toString(),
                                                        "__v" : 0

                                                      };

                                                        collection.insert(insertData,function(error,result){
                                                          if (error) {
                                                            console.log(error);
                                                          }else{
                                                            console.log(result.result.n);
                                                          }

                                                        });
                                                        arrDeviceList=[];
                                                        slaveId=[];
                                                        //db.close();

                                                      }else{

                                                        for(var i=0;i<allDeviceList.length;i++){
                                                            //片段当前设备在数据库是否存在

                                                            var checkDevice = contains(devices,allDeviceList[i].serialNumber);

                                                            if(checkDevice==false){

                                                              db.collection('devices',function(err,collection){
                                                              collection.update({serialNumber:allDeviceList[i].serialNumber},{$set:{status:4}},{safe:true},function(err,result){

                                                              });
                                                              })
                                                            }else if(checkDevice==true){
                                                              if(allDeviceList[i].status===4){
                                                                console.log('设备状态改为  1  ');
                                                                db.collection('devices',function(err,collection){
                                                                collection.update({serialNumber:allDeviceList[i].serialNumber},{$set:{status:1}},{safe:true},function(err,result){

                                                                });
                                                                //设备IP切换"slaveId":slaveId[0].toString(),
                                                                collection.update({serialNumber:allDeviceList[i].serialNumber},{$set:{slaveId:slaveId[0].toString()}},{safe:true},function(err,result){

                                                                });
                                                                })
                                                              }
                                                            }
                                                          }
                                                        //  db.close();

                                                          slaveId=[];

                                                        }
                                                    });
                                                   }
                                        } catch (err) {
                                            console.log(err);
                                        }

                                          });
                                      //  });

                                    } catch (err) {
                                        console.log(err);
                                    }

                              return client.readdir(device.id, '/data/local/tmp')
                                  .then(function (files) {

                                      var hasMiniTouch = false;
                                      var hasMiniCap = false;
                                      var hasMiniCapSo = false;

                                      files.forEach(function (file) {
                                          if (file.isFile()) {
                                              if ('minitouch' == (file.name)) {
                                                  hasMiniTouch = true;
                                              } else if ('minicap' == (file.name)) {
                                                  hasMiniCap = true;
                                              } else if ('minicap.so' == (file.name)) {
                                                  hasMiniCapSo = true;
                                              }
                                          }
                                      });

                                      if (!(hasMiniTouch && hasMiniCap && hasMiniCapSo)) {
                                          console.log('something not installed');

                                          return client.getProperties(device.id)
                                              .then(co.wrap(function*(properties) {
                                                  var cpu = properties['ro.product.cpu.abi'];
                                                  var sdk = properties['ro.build.version.sdk'];
                                                  var minicapPath = 'minicap-prebuilt/prebuilt/' + cpu + '/bin/minicap' + (sdk >= 16 ? '' : '-nopie');
                                                  var minicapSoPath = 'minicap-prebuilt/prebuilt/' + cpu + '/lib/android-' + sdk + '/minicap.so';
                                                  var minitouchPath = 'minitouch/' + cpu + '/minitouch' + (sdk >= 16 ? '' : '-nopie');

                                                  try {
                                                      //push minicap and minicap.so
                                                      if (!hasMiniCap) {
                                                          console.log('minicap not installed,and install minicap ...');
                                                          yield client.push(device.id, pathUtil.module(minicapPath), resources.bin.dest, resources.bin.mode);
                                                      }

                                                      if (!hasMiniCapSo) {
                                                          console.log('minicapso not installed,and install minicapso ...');
                                                          yield client.push(device.id, pathUtil.module(minicapSoPath), resources.lib.dest, resources.bin.mode);
                                                      }

                                                  } catch (ex) {
                                                      console.log('安装minicap失败');
                                                  }
                                                  try {
                                                      if (!hasMiniTouch) {
                                                          //push mini touch
                                                          console.log('minitouch not installed,and install minitouch ...');
                                                          yield client.push(device.id, pathUtil.vendor(minitouchPath), '/data/local/tmp/minitouch', 0o755);
                                                          yield client.shell(device.id, '/data/local/tmp/minitouch &');
                                                      }
                                                  } catch (ex) {
                                                      console.log('安装启动minitouch失败');
                                                  }
                                              }));
                                      } else {

                                          client.shell(device.id, ' ps | grep minitouch').then(adb.util.readAll)
                                              .then(function (output) {
                                                  var result = output.toString().trim();
                                                  if (!result) {
                                                      console.log('start minitouch')
                                                      client.shell(device.id, '/data/local/tmp/minitouch &');
                                                  }
                                              }).catch(function (err) {
                                              console.log('启动minitouch失败');
                                          })

                                          var resolution;

                                          return client.shell(device.id, ' wm size').then(adb.util.readAll)
                                              .then(function (result) {
                                                  result.toString().replace(/Physical size: (.+?)\s+\r?\n/g, function (all, screen) {
                                                      resolution = screen.toString().trim();
                                                  });
                                                  return resolution;
                                              }).then(function (resolution) {
                                                  return client.shell(device.id, ' ps | grep minicap')
                                              })
                                              .then(adb.util.readAll)
                                              .then(function (output) {
                                                  var result = output.toString().trim();

                                                  if (!result) {
                                                      return client.shell(device.id, util.format(
                                                          'LD_LIBRARY_PATH=%s exec %s %s &', path.dirname(resources.lib.dest), resources.bin.dest, '-P ' + resolution + '@' + resolution + '/0 '
                                                      ));

                                                  }
                                              }).catch(function (err) {
                                                  console.log(err);
                                              })


                                      }

                                  });
                                })
                          }

                        },{concurrency: 1})


                    });


            });


        },5 * 1000)
  });
}



module.exports = installMiniCapAndTouch;
