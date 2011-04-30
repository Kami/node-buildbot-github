var crypto = require('crypto');

var sprintf = require('sprintf').sprintf;

function getAuthHeaders(username, password) {
  var headers = {};

  if (!username || !password) {
    throw new Error('Missing username or password');
  }

  var auth = 'Basic ' + new Buffer(username + ':' + password).toString('base64');
  headers.auth = auth;

  return headers;
}

function getPropertyValue(properties, name) {
  // Properties is a triple: [name, value, something]
  var i, propertiesLen, property;

  propertiesLen = properties.length;

  for (i = 0; i < propertiesLen; i++) {
    property = properties[i];
    if (propertiesLen[0].toLowerCase() === name) {
      return property[1];
    }

    return null;
  }
}

function getPullRequestHash(pullRequestId, headSha) {
  var hash = crypto.createHash('md5');
  hash.update(sprintf('%s:%s', pullRequestId, headSha));

  return hash.digest('base64');
}

exports.getAuthHeaders = getAuthHeaders;
exports.getPropertyValue = getPropertyValue;
exports.getPullRequestHash = getPullRequestHash;
