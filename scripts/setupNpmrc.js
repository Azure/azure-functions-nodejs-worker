// Writes a project-scoped .npmrc that points npm at the correct azfunc feed.
//
// The checked-in repo intentionally has NO .npmrc so that public contributors
// cloning from GitHub get the default public registry (registry.npmjs.org).
// This script generates a local, gitignored .npmrc on demand:
//
//   - Azure DevOps 'internal' project -> azfunc/internal/upstream
//   - Azure DevOps 'public' project   -> azfunc/public/upstream-public
//   - Local developer machine         -> azfunc/public/upstream-public
//
// It is intentionally dependency-free (Node built-ins only) so it can run
// before `npm ci` and without a populated node_modules.

const { getEnvironment } = require('./buildEnv.js');
const { writeFileSync } = require('fs');
const { join } = require('path');

const FEEDS = {
    internal: 'https://pkgs.dev.azure.com/azfunc/internal/_packaging/upstream/npm/registry/',
    public: 'https://pkgs.dev.azure.com/azfunc/public/_packaging/upstream-public/npm/registry/',
};

/**
 * Resolves which feed key to use based on the detected environment.
 */
function getRegistry(buildEnv) {
    if (buildEnv?.type === 'azure-devops' && buildEnv.project === 'internal') {
        return FEEDS.internal;
    }

    // Local developer machine or non-internal feeds in CI: use the public feed.
    return FEEDS.public;
}

/**
 * Writes the .npmrc for the given (or detected) environment.
 * @returns {{ target: string, registry: string, isDevops: boolean }}
 */
function run(buildEnv) {
    if (!buildEnv) {
        buildEnv = getEnvironment();
    }

    const registry = getRegistry(buildEnv);
    const contents = `registry=${registry}\nalways-auth=true\n`;
    const target = join(__dirname, '..', '.npmrc');
    writeFileSync(target, contents);

    const isDevops = buildEnv.type === 'azure-devops';
    const source = isDevops ? `Azure DevOps project '${buildEnv.project}'` : 'local developer machine';
    console.log(`Detected: ${source}`);
    console.log(`Wrote ${target}`);
    console.log(`  registry=${registry}`);
    if (!isDevops) {
        console.log('Next: authenticate with the feed, e.g. `npx better-vsts-npm-auth -c .npmrc`.');
    }

    return { target, registry, isDevops };
}

module.exports = { run };

if (require.main === module) {
    run();
}
