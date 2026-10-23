---
name: Package resolver compatibility
description: An npm resolver failure encountered while adding the authentication frontend.
---

On this environment, npm 10 with Node 20 crashed with `Cannot read properties
of null (reading 'edgesOut')` when resolving the newest Vite dependency graph.
This was not a package-firewall rejection. Installing the compatible Vite 6
major allowed the React and Clerk dependencies to resolve normally.

**Why:** Repeating the same unpinned install did not change the resolver failure.

**How to apply:** When upgrading frontend tooling, inspect the actual npm error
before retrying. Keep the working major unless an upgrade is intentional, or
update the runtime/package manager deliberately rather than bypassing the
package firewall.
