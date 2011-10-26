var http = require('http');
var https = require('https');
var querystring = require('querystring');

var sprintf = require('sprintf').sprintf;
var log = require('logmagic').local('buildbot-github.buildbot');

var utils = require('./utils');

function BuildBot(options) {
  this._options = options;

  this._host = options['host'];
  this._port = options['port'];
  this._secure = options['secure'];
  this._username = options['username'];
  this._password = options['password'];

  this._changeHookPath = options['change_hook_path'];
  this._builderName = options['builder_name'];

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
                                          repository, category, branch,
                                          callback) {
  // Send changes which will trigger a build
  var name = user.name.replace(/[^a-zA-Z0-9-._~\s]/g, ''); // Buildbot doesn't like unicode
  var nickname = user.login;
  var who = sprintf('%s <%s>', name, user.email);

  var properties = {
    'pull-request-id': pullId,
    'github-nickname': nickname
  };

  var body = querystring.stringify({
    'project': project,
    'repository': repository,
    'revision': revision,
    'who': who,
    'branch': branch,
    'category': category,
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
