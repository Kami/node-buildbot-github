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
    'path': this._changeHookPath,
    'method': 'POST',
    'headers': {}
  };

  if (this._username && this._password) {
    var authHeader = utils.getAuthHeader(this._username, this._password);
    this._sendChangesReqObj.headers.Authorization = authHeader;
  }
}

BuildBot.prototype.sendChanges = function(pullId, revision, user, project,
                                          repository, branch, callback) {
  // Send changes which will trigger a build
  var request = '';
  var properties = {
    'pull-request-id': pullId
  };

  var body = querystring.stringify({
    'project': project,
    'repository': repository,
    'revision': revision,
    'who': user,
    'branch': branch,
    'category': 'pull_request',
    'comments': 'triggered build',
    'properties': JSON.stringify(properties)
  });

  var reqOptions = utils.merge({}, this._sendChangesReqObj);
  reqOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
  reqOptions.headers['Content-length'] = body.length;

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
