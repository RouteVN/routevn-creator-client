## Fixing Visual Tests for the Client App

The core issue is that our test runner is built for static websites, it tries to create a separate HTML page for each test. That just doesn't work for our client app, which needs to run as a single, complete application.

### Approach 1: URL in Spec Files

Here's the idea: we could add a `url` property directly into the frontmatter of each test file.

```yaml
# vt/specs/projects/projects.yaml
---
title: Initial Project Page Load
url: /projects
steps:
  - select some-property:
       - click
  - screenshot
---
```

**How it works:**
The test runner would check for this `url` property. If it finds one, it would skip generating a static HTML file. Instead, it would start the dev server, navigate the browser to that specific URL (e.g., `http://localhost:3001/projects`), take the initial screenshot there, and then run the steps.

**Advantages:**
*   **Flexible:** Each test file can point to a completely different page in the app. This could be useful if we ever need to test deep-linked routes directly.
*   **Explicit:** It's very clear which page a test file is intended for, just by looking at the file itself.

**Trade-offs:**
*   **Repetitive:** We'd have to add the `url` property to every single test file. For our app, most tests will likely start from the same page anyway.
*   **A Bit Messy:** since it always takes the initial screenshot before the step is executed, it will cause a flash (becuase the vt will open a page not found in client)

### Approach 2: Global Test URL in Config 

My preferred solution is to make a single change in our main config file. We'd add a new setting that tells the test runner it's dealing with a full application, not a collection of static pages.

```yaml
# rettangoli.config.yaml
vt:
  # url here
  appUrl: "http://localhost:3001/projects"

  path: 'vt'
  name: "Rettangoli UI Visual Tests"
  # ... rest of the config
```

**How it works:**
When the test runner sees `vt.appUrl`, it switches into a new "app mode":

1.  It **completely skips** generating individual HTML files from the test specs.
2.  It starts the dev server.
3.  For *every single test file*, it navigates the browser to the one URL specified in `appUrl`.
4.  It takes the initial screenshot and then runs the `steps` from that test file.
5.  When it's done, it reloads the `appUrl` to get a clean slate and runs the next test file.

**Advantages:**
*   **Clean and Simple:** We define our app's entry point in one place. If it ever changes, we only have one line to update.
*   **Keeps Tests Focused:** Our test files (`.yaml`) can focus purely on the *actions* we want to perform (`steps`), not on *where* they need to run.

**Trade-offs:**
*   **Less Flexible for One-Offs:** If we ever wanted a single test to run on a completely different starting page, this approach doesn't allow for it. But given how our client app works, this seems like a non-issue.
*   **Too Mucg First Screenshot:** The initial screenshot (before any steps) will be the same for every single test.