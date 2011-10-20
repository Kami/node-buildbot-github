var util = require('util');
var http = require('http');
var url = require('url');
var EventEmitter = require('events').EventEmitter;

var log = require('logmagic').local('buildbot-github.server');

/**
 * Web server which listens for webhook events and emits the following events:
 *
 * - trigger_comment - emitted when an event with trigger string is found
 * - pull_request - emitted when a pull request has been opened or updated
 */
function WebServer(ip, port, secret, triggerString) {
  EventEmitter.call(this);

  this._ip = ip;
  this._port = port;
  this._secret = secret;
  this._triggerString = triggerString;

  this._server = null;
}

util.inherits(WebServer, EventEmitter);

WebServer.prototype.start = function() {
  this._listen(this._ip, this._port);
};

WebServer.prototype.stop = function() {
  var self = this;

  if (this._server) {
    this._server.close();
    this._server.on('close', function onClose() {
      self.server = null;
    });
  }
};

WebServer.prototype._listen = function(ip, port) {
  this._server = http.createServer(this._handleRequest.bind(this));
  this._server.listen(port, ip);

  log.info('Server listening at http://${ip}:${port}/',
           {'ip': ip, 'port': port});
};

WebServer.prototype._handleRequest = function(req, res) {
  var self = this,
      parsed = url.parse(req.url, true),
      query = parsed.query,
      payload = '';

  if (!query.secret || query.secret !== this._secret) {
    log.info('Invalid or missing secret provided by ${ip}',
             {'ip': req.client.remoteAddress});

    res.writeHead(401, {'Content-Type': 'text/plain'});
    res.end();
    return;
  }

  req.on('data', function onData(chunk) {
    payload += chunk;
  });

  req.on('end', function onEnd() {
    try {
      payload = JSON.parse(payload);
    }
    catch (err) {
      log.err('Failed to parse request body: ${err}', {'err': err.toString()});
      return;
    }

    self._handlePayload(payload);
    res.end();
  });
};

WebServer.prototype._handlePayload = function(payload) {
  if (payload.action === 'created' && payload.issue && payload.issue.body) {
    this._handleIssueComment(payload);
  }
};

WebServer.prototype._handleIssueComment = function(payload) {
  if (!payload.issue.pull_request) {
    log.info('Comment #${id} is not a pull request comment, ignoring,',
             {'id': payload.comment.id});
    return;
  }
  else if (payload.comment.body !== this._triggerString) {
    log.info('Comment #${id} does not contain a trigger string, ignoring,',
             {'id': payload.comment.id});
    return;
  }

  log.info('Trigger string found, emitting "trigger_comment"...');
  this.emit('trigger_comment', payload);
};

exports.WebServer = WebServer;
