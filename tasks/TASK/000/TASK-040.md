---
title: make sure export can run and is correct
status: done
priority: high
---

# Description

From the versions page. User can create version and export it.
We export 3 files:
- html file (just calls the js file)
- js file (main.js)
- data file (all resources bundled concatenated into 1 file)

The 3 files are zipped into 1 file.

When user unzips the file and opens the html file, it wont work and this is expected. because in local file browser env, you cannot make http request to local files.

Instead run a `bunx serve` or something and then open the localhost to check if the VN can run properly.

The issue is the  `main.js` file is very outdated. https://github.com/RouteVN/routevn-creator-client/blob/5117fcc7dc7da1dbcc28863a06f573db4ecc1a81/scripts/main.js#L1

We need to update it to follow latest versions. can refer to route-engine's main.js


## Outcome

the exported bundle, should run correctly with a web server, outputs should  be same as the preview.


## Future

out of the scope, but later we will need to test that this web version can be uploaded and run properly in itch.io

The risk is we are using the http content range API (to get partial content from the 1 huge assets bundled file), and i'm not sure itch.io web server supports it.



