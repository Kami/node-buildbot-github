var util = require('util');
var EventEmitter = require('events').EventEmitter;

var GitHubApi = require('github').GitHubApi;
var async = require('async');
var log = require('logmagic').local('buildbot-github.core');

var BuildBot = require('./buildbot').BuildBot;
var utils = require('./utils');
var pollers = require('./pollers');

function BuildbotGithub(options) {
  this._options = options;

  this._githubPoller = null;
  this._buildbotPoller = null;

  this._pullCache = {};
  this._intervalId = null;
}

util.inherits(BuildbotGithub, EventEmitter);

BuildbotGithub.prototype._initialize = function() {
  this._github = new GitHubApi(true);
  this._github.authenticate(this._options['github']['username'],
                            this._options['github']['token']);

  // Set up pollers
  this._githubPoller = new pollers.GithubPoller(this._options['github'],
                                                this._options['general']['github_poll_interval']);
  this._buildbotPoller = new pollers.BuildbotPoller(this._options['buildbot'],
                                                    this._options['general']['buildbot_poll_interval']);

  // Set up Buildbot instance
  this._buildbot = new BuildBot(this._options['buildbot']['host'],
                                this._options['buildbot']['port'],
                                this._options['buildbot']['secure'],
                                this._options['buildbot']['username'],
                                this._options['buildbot']['password'],
                                this._options['buildbot']['change_hook_path'],
                                this._options['buildbot']['builder_name']);

  // Register change handlers
  this._githubPoller.on('new_pull_request', this._handleNewPullRequest);
  this._buildbotPoller.on('new_build', this._handleNewBuild);
};

BuildbotGithub.prototype.start = function() {
  this._initialize();
  this._githubPoller.start();
  this._buildbotPoller.start();
};

BuildbotGithub.prototype.stop = function() {
  this._githubPoller.stop();
  this._buildbotPoller.stop();
};

BuildbotGithub.prototype._handleNewPullRequest = function(pullRequest) {
  // Check if we need to trigger force build for this request
  var self = this;
  var id = pullRequest['number'];

  function handleGotPullRequestDiscussion(err, pull) {
    var discussion, forceBuildNeeded;

    if (err) {
      log.error('Error while retrieving pull request #${id} discussions: ${err}',
                {'id': id, 'err': err.message});
      return;
    }

    discussion = pull.discussion;
    forceBuildNeeded = self._forceBuildNeeded(discussion);

    if (!forceBuildNeeded) {
      log.info('Force build for request #${id} is not needed', {'id': id});
      return;
    }

    log.info('New pull request has been found (#${id})', {'id': id});
    self._handleGotNewPullRequest(pull);
  }

  this._github.getPullApi().getDiscussion(this._options['github']['user'],
                                        this._options['github']['project'],
                                        id, handleGotPullRequestDiscussion);
};

BuildbotGithub.prototype._handleGotNewPullRequest = function(pullRequest) {
  var requestCache;
  var pullId = pullRequest['number'];
  var pullHash = utils.getPullRequestHash(pullId, pullRequest['head']['repository']['sha']);
  var user = pullRequest['user']['login'];
  var branch = pullRequest['head']['repository']['ref'];

  requestCache = this._pullCache[pullHash];

  if (!requestCache) {
    this._pullCache[pullHash] = {
      'id': pullId,
      'build_pending': true,
      'build_forced': false,
      'comment_posted': false
    };
  }

  if (requestCache['build_pending'] || requestCache['build_forced']) {
    log.info('Build has already been forced for pull request #${id}', {'id': pullId});
    return;
  }

  function onEnd(err, body) {
    if (err) {
      log.error('Failed to notify buildbot about new pull request: ${err}',
                {'err': err.message});
      requestCache['build_pending'] = false;
      return;
    }

    requestCache['build_forced'] = true;
  }

  this._buildbot.sendChanges(pullId, pullHash, user,
                             this._options['github']['project'],
                             this._options['github']['repository'],
                             branch,
                             onEnd);
};

BuildbotGithub.prototype._handleNewBuild = function(build) {
  var properties, pullId, builderPullHash, requestCache;
  properties = build.properties;
  pullId = utils.getPropertyValue(properties, 'pull-id');
  builderPullHash = utils.getPropertyValue(properties, 'pull-hash');

  // Check if there are any pending builds with this pull hash
  requestCache = this._pullCache[builderPullHash];

  if (!requestCache) {
    log.info('No pending builds for pull request #${id}', {'pull-id': pullId});
    return;
  }

  requestCache['build_pending'] = false;
  this._postPullRequestComment(build, builderPullHash);
};


BuildbotGithub.prototype._postPullRequestComment = function(build, pullId,
                                                            pullHash) {
  // @TODO: Add comment to the issue on github
  var requestCache;
  requestCache = this._pullCache[pullHash];

  log.info('Posting comment with build results for pull request #${id}',
           {'id': pullId});

  // Mark as completed
  requestCache['comment_posted'] = true;
};

BuildbotGithub.prototype._forceBuildNeeded = function(discussion) {
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

exports.BuildbotGithub = BuildbotGithub;
