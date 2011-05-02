# Buildbot Github

A module which periodically polls Github API for open pull requests and triggers
a Buildbot build when a new pull request is found.

A comment with a link to the build result is also added to the pull request when a
build has completed.

This module assumes the following things:

* each pull request references commits in a separate branch
* you have configured a special builder for this purpose (you set the name of
  this builder in the config file)

# TODO

* Validate config file
