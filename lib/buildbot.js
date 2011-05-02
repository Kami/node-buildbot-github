var http = require('http');
var https = require('https');
var querystring = require('querystring');

var sprintf = require('sprintf').sprintf;
var log = require('logmagic').local('buildbot-github.buildbot');

var utils = require('./utils');

function BuildBot(host, port, secure, username, password,
                  changeHookPath, builderName) {
  this._host = host;
  this._port = port;
  this._secure = secure;
  this._username = username;
  this._password = password;

  this._changeHookPath = changeHookPath;
  this._builderName = builderName;

  // Prepare objects which are used when making requests
  this._http = (this._secure) ? https : http;

  this._sendChangesReqObj = {
    'host': this._host,
    'port': this._port,
    'path': this._change_hook_path,
    'method': 'POST'
  };

  if (this._username && this._password) {
    var headers = utils.getAuthHeaders(this._username, this._password);
    this._sendChangesReqObj.headers = headers;
  }
}

BuildBot.prototype.sendChanges = function(pullId, pullHash, user, project,
                                          repository, branch, callback) {
  // Send changes which will trigger a build
  var request = '';
  var properties = {
    'pull-id': pullId,
    'pull-hash': pullHash
  };

  var body = querystring.stringify({
    'project': project,
    'repository': repository,
    'who': user,
    'branch': branch,
    'category': 'pull-request',
    'properties': properties,
  });

  var options = {};
  options.headers = {
    'Content-type': 'application/x-www-form-urlencoded',
    'Content-length': body.length
  };

  var reqOptions = utils.merge(options, this._sendChangesReqObj);

  var req = this._http.request(reqOptions, function onResponse(res) {
    var data = '';

    function onData(chunk) {
      data += chunk;
    }

    function onEnd() {
      callback(null, data.toString());
    }

    res.on('data', onData);
    res.on('end', onEnd);
  });

  req.on('error', callback);

  req.end(body);
};

exports.BuildBot = BuildBot;
