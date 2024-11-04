## Using the library
To use this library as an npm package, you need to be logged in to the GitHub Packages npm registry.

1. Create [a personal access token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-personal-access-token-classic) with at least `read:packages` privileges.
2. Login to the GitHub npm registry with `npm login --registry https://npm.pkg.github.com`.
3. Have the source of the library specified with `@chromoskein:registry=https://npm.pkg.github.com` in your `.npmrc`.
4. Then use and install like normal `npm install @chromoskein/lib-graphics`.

## Contributing
To contribute to the library while working on your own project, use the [`npm link`](https://docs.npmjs.com/cli/v8/commands/npm-link) command, or an alternative from your package manager.

<!-- TODO: specify the exact npm script -->
Then you can just watch-compile the library and use it normally in your project.

### Publishing
<!-- TODO: check exact minimal permissions -->
If you wish to publish a new version of the library, you need a personal access token with at least `delete:packages`, `repo`, and `write:packages`.

<!-- TODO: any automatic publishing? -->
Authenticate with the said token as normal, and use `yarn publish`.
Provide a new version (`package.json` will be updated later for you), and it will be successfully published.
