# Buildbot Github

A service which receives webhook events when a comment is added to a pull
request and triggers a [Buildbot](http://trac.buildbot.net/) build when a
comment with trigger string defined in a config is found in a pull request.

A comment with build status and a link to the build result is added to the
pull request when a build has completed.

# Service Configuration

Configuration is stored in a JSON file. Example configuration can be found at
`axample/config.json`.

# Buildbot Configuration

### Enable `base` change_hook dialect in your `master.cfg`. For example:

```python
c['status'].append(html.WebStatus(http_port=8010, allowForce=True,
                                   change_hook_dialects={'base': True}))
```

### Set up a separate builder for the pull requests. For example:

```python
f = factory.BuildFactory()
f.addStep(Git(repourl="git://github.com/<user>/<project>.git", mode="copy"))
f.addStep(ShellCommand(command = ['make', 'test']))
c['builders'].append(
{
  'name': '<some-builder-which-will-build-pull-requests>',
  'slavename': c['slaves'][0].slavename,
  'builddir': '<some-builder-which-will-build-pull-requests>',
  'factory': f
})
```

### Set up `ChangeFilter` and `Scheduler`. For example

```python
change_filter = ChangeFilter(repository='https://github.com/<repository user>/<repository name>',
                             category='<category specified in the config>')
scheduler = basic.Scheduler("pull request builder", treeStableTimer=1,
                           builderNames=['<some-builder-which-will-build-pull-requests>'],
                           change_filter=change_filter)
c['schedulers'].append(scheduler)
```

Note: `repository` setting in the change filter must match `repository` setting
in the config file.

# Github Webhook notifications

```bash
curl -u "<github username>/token:<api token>" -H "Content-Type: application/json" -X POST -d '{
 "name": "web",
  "active": true,
  "events": ["issue_comment"],
  "config": {
    "url": "http://<server ip:server port>/?secret=<secret>",
    "content_type": "json"
  }
}' https://api.github.com/repos/<user>/<project name>/hooks
```

This will set up a hook for the repository specified in the config.

# Limitations

* You need to run one service instance per repository.

# TODO

* https support
* Validate config file
* Use Redis for cache
* Automate "Setup webhook events" step (need to add support for Github v3 API
  methods)
