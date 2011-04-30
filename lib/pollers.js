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

Poller.prototype.initialize = function() {
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

// Polls Github for new pull request
function GithubPoller(options, interval) {
  Poller.call(this, 'github', options, interval);
}

util.inherits(GithubPoller, Poller);

GithubPoller.prototype.initialize = function() {
  this._github = new GitHubApi(true);
  this._github.authenticate(this._options['username'],
                            this._options['token']);
  Poller.prototype.initialize.call(this);
};

GithubPoller.prototype._pollForChanges = function() {
  var self = this;

  function handleGotPullRequestDiscussions(err, pullRequest, discussion) {
    if (err) {
      log.error('Error while retrieving pull request #${id} discussions: ${err}',
                {'id': pullRequest['num'], 'err': err.message});
      return;
    }

    log.debug('New pull request has been found (#${id}), emitting an event',
             {'id': pullRequest['number']});
    self.emit('new_request', pullRequest);
  }

  function handleGotPullRequestList(err, pullRequests) {
    var i, pullRequest, pullRequestsLen, id, issueUpdatedAt, cache, cacheObj;

    if (err) {
      log.error('Error while retrieving pull requests list: ${err}',
                {'err': err.message});
      return;
    }

    pullRequestsLen = pullRequests.length;
    for (i = 0; i < pullRequestsLen; i++) {
      pullRequest = pullRequests[i];
      id = pullRequest['number'];
      cache = self._pollCache[id];

      if (cache && ((cache['issue_updated_at'] ===
          pullRequest['issue_updated_at']) || (cache['build_forced'] === true) || (cache['build_pending'] === true))) {
        // Nothing has changed or a build has already been forced
        continue;
      }

      cacheObj = {
        'issue_updated_at': pullRequest['issue_updated_at'],
        'user': pullRequest['issue_user'],
        'diff_url': pullRequest['diff_url'],
        'html_url': pullRequest['html_ull'],
        'head_ref': pullRequest['head']['repository']['ref'],
        'head_sha': pullRequest['head']['repository']['sha'],
        'build_pending': false,
        'build_forced': false,
      };

      self._pollCache[id] = cacheObj;

      self._github.getPullApi().getDiscussion(self._options['user'],
                                              self._options['project'],
                                              id,
        function(err, pull) {
          if (err) {
            handleGotPullRequestDiscussions(err);
            return;
          }

          handleGotPullRequestDiscussions(null, pullRequest, pull.discussion);
      });
    }
  }

  this._github.getPullApi().getList(this._options['user'],
                                    this._options['project'],
                                    'open',
                                    handleGotPullRequestList);

};

// Polls buildbot for new builds
function BuildbotPoller(options, interval) {
  Poller.call(this, 'buildbot', options, interval);

  this._fetchBuildDataReqObj = null;
}

util.inherits(BuildbotPoller, Poller);

BuildbotPoller.prototype.initialize = function() {
  this._fetchBuildDataReqObj = {
    'host': this._options['host'],
    'port': this._options['port'],
    'path': sprintf(BUILDER_STATUS_URL, this._options['builder']),
    'method': 'GET'
  };

  this._http = (this._options['secure']) ? https : http;

  if (this._username && this._password) {
    var headers = utils.getAuthHeaders(this._username, this._password);
    this._fetchBuildDataReqObj.headers = headers;
  }

  Poller.prototype.initialize.call(this);
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
      self.emit('new_build');
    }
  }
};

exports.GithubPoller = GithubPoller;
exports.BuildbotPoller = BuildbotPoller;
