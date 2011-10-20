var util = require('util');
var http = require('http');
var https = require('https');
var EventEmitter = require('events').EventEmitter;

var GitHubApi = require('./extern/node-github').GitHubApi;
var sprintf = require('sprintf').sprintf;
var log = require('logmagic').local('buildbot-github.pollers');

var utils = require('./utils');

var BUILDER_STATUS_URL = '/json/builders/%s/builds/_all';

function Poller(name, options, interval) {
  EventEmitter.call(this);

  this._name = name;
  this._options = options;
  this._interval = interval;

  this._pollCache = {};
  this._intervalId = null;
}

util.inherits(Poller, EventEmitter);

Poller.prototype.start = function() {
  this._initialize();
};

Poller.prototype.stop = function() {
  clearInterval(this._interval);
};

Poller.prototype._initialize = function() {
  var self = this;
  log.info('Poller ${name} initialized. Polling for changes every ${interval} ms',
           {'name': this._name, 'interval': this._interval});

  this._intervalId = setInterval(function() {
    self._pollForChanges();
  }, this._interval);
};

Poller.prototype._pollForChanges = function() {
  throw new Error('Not implemented');
};

// Polls buildbot for new builds
function BuildbotPoller(options, interval) {
  Poller.call(this, 'buildbot', options, interval);

  this._host = this._options['host'];
  this._port = this._options['port'];
  this._username = this._options['username'];
  this._password = this._options['password'];

  this._fetchBuildDataReqObj = null;
}

util.inherits(BuildbotPoller, Poller);

BuildbotPoller.prototype._initialize = function() {
  this._fetchBuildDataReqObj = {
    'host': this._host,
    'port': this._port,
    'path': sprintf(BUILDER_STATUS_URL, this._options['builder_name']),
    'method': 'GET',
    'headers': {}
  };

  this._http = (this._options['secure']) ? https : http;

  if (this._username && this._password) {
    var authHeader = utils.getAuthHeader(this._username, this._password);
    this._fetchBuildDataReqObj.headers.Authorization = authHeader;
  }

  Poller.prototype._initialize.call(this);
};

BuildbotPoller.prototype._pollForChanges = function() {
  var self = this;

  var request = this._http.get(this._fetchBuildDataReqObj, function(res) {
    var body = '';

    function handleData(chunk) {
      body += chunk;
    }

    function handleEnd() {
      body = body.toString();
      try {
        body = JSON.parse(body);
      }
      catch (err) {
        log.error('Failed to parse buildbot response: ${err}',
                  {'err': err.toString()});
        return;
      }

      self._handleGotBody(body);
    }

    res.on('data', handleData);
    res.on('end', handleEnd);

    if (res.statusCode !== 200) {
      var err = new Error('Failed fetching builder status data, statusCode !== 200');
      res.removeAllListeners('data');
      res.removeAllListeners('end');
      log.error(err.message);
      return;
    }
  });

  request.on('error', function(err) {
    log.error(err.message);
  });
};

BuildbotPoller.prototype._handleGotBody = function(body) {
  var self = this;
  var i, key, cache, build;

  for (key in body) {
    if (body.hasOwnProperty(key)) {
      key = key.toString();
      cache = self._pollCache[key];
      build = body[key];

      if (cache) {
        continue;
      }

      log.debug('Found a new build (${key}), emitting an event', {'key': key});
      self._pollCache[key] = build;
      self.emit('new_build', build);
    }
  }
};

exports.BuildbotPoller = BuildbotPoller;
