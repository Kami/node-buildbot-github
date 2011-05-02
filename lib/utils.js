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

// Taken from Cast (https://github.com/cloudkick/cast) which is Apache 2.0
// licensed
/*
 * Licensed to Cloudkick, Inc ('Cloudkick') under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * Cloudkick licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
function merge(a, b) {
  var c = {};
  var attrname;
  for (attrname in a) {
    if (a.hasOwnProperty(attrname)) {
      c[attrname] = a[attrname];
    }
  }
  for (attrname in b) {
    if (b.hasOwnProperty(attrname)) {
      c[attrname] = b[attrname];
    }
  }
  return c;
}

exports.getAuthHeaders = getAuthHeaders;
exports.getPropertyValue = getPropertyValue;
exports.getPullRequestHash = getPullRequestHash;
exports.merge = merge;
