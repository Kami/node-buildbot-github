var util = require('util');
var EventEmitter = require('events').EventEmitter;

var GitHubApi = require('github').GitHubApi;
var async = require('async');
var log = require('logmagic').local('buildbot.github.core');

var BuildbotNotifier = require('./buildbot').BuildbotNotifier;

function BuildbotGithub(options) {
  this._options = options;

  this._github = null;
  this._buildbotNotifier = null;

  this._pullCache = {};
  this._intervalId = null;
}

util.inherits(BuildbotGithub, EventEmitter);

BuildbotGithub.prototype.initialize = function() {
  this._github = new GitHubApi(true);
  this._github.authenticate(this._options['github']['username'],
                            this._options['github']['token']);


  this._buildbotNotifier = BuildbotNotifier(this._options['buildbot']['url'],
                                            this._options['buildbot']['username'],
                                            this._options['buildbot']['password'])
  this._intervalId = setInterval(this._pollForChanges,
                                 this._options['genaral']['poll_interval']);

  this.on('new_event', this._handleGotNewPullRequest);
};

BuildbotGithub.prototype._pollForChanges = function() {
  var self = this;

  function handleGotPullRequestDiscussions(err, pullRequest, discussion) {
    if (err) {
      log.error('Error while retrieving pull request #${id} discussions: ${err}',
                {'id': pullRequest['num'], 'err': err.message});
      return;
    }

    log.info('New pull request has been found (#${id}), emitting an event',
             {'id': pullRequest['num']});
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
      id = pullRequest['num'];
      cache = self._pullCache[id];

      if (cache && ((cache['issue_updated_at'] ===
          pullRequest['issue_updated_at']) || (cache['build_forced'] === true) || (cache['build_pending'] === true))) {
        // Nothing has changed or a build has already been forced
        continue;
      }

      cacheObj = {
        'issue_updated_at': pullRequest['issue_updated_at'],
        'user': pullRequest['issue_user'],
        'diff_url': pullRequest['diff_url'],
        'patch_url': pullRequest['patch_url'],
        'html_url': pullRequest['html_ull'],
        'build_pending': false,
        'build_forced': false,
      };

      self._pullCache[id] = cacheObj;

      self._github.getPullApi.getDiscussion(this._options['github']['username'],
                                            this._options['github']['repository'],
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

  log.info('Polling for pull request changes');
  this._github.getPullApi().getList(this._options['github']['username'],
                                    this._options['github']['repository'],
                                    this._options['filters']['state'],
                                    handleGotPullRequestList);
};

BuildbotGithub.prototype._handleGotNewPullRequest = function(pullRequest) {
  var id = pullRequest['num'];

  // Mark build request as pending
  this._pullCache[id]['build_pending'] = true;

  this._pullCache[id]['build_pending'] = false;
  this._pullCache[id]['build_forced'] = true;
};

BuildbotGithub.prototype._buildForceNeeded = function(discussion) {
  // Goes through all the pull request comments and try to find out if a build
  // request for this pull request is needed.
  var i, discussionLen, entry;

  discussionLen = discussion.length;
  for (i = 0; i < discussionLen; i++) {
    entry = discussion[i];

    if (entry['type'] === 'IssueComment' &&
        (entry['user']['login'] === this._options['github']['username'])) {
        // Found my comment, build has already been forced, bailing out
      return false;
    }

    return true;
  }
};
