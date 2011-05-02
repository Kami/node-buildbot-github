var fs = require('fs');
var path = require('path');

var core = require('./core');

function loadConfig(configPath) {
  var content, parsed;
  if (!path.existsSync(configPath)) {
    throw new Error(configPath + ' path does not exist');
  }

  content = fs.readFileSync(configPath);
  parsed = JSON.parse(content);

  return parsed;
}

function run(configPath) {
  var config, instance;

  config = loadConfig(configPath);
  instance = new core.BuildbotGithub(config);
  instance.start();

  process.on('SIGINT', function() {
    instance.stop();
    process.exit();
  });
}

exports.run = run;
