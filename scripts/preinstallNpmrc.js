// preinstall hook: best-effort, cross-platform decision about whether the
// azfunc feed setup (`npm run setup:npmrc`) should run automatically.
//
// It runs the setup when EITHER:
//   (1) the current user looks like a Microsoft (@microsoft.com) user, or
//   (2) the build is running in the azfunc Azure DevOps organization.
//
// Everyone else (e.g. public GitHub contributors) is left untouched, so a
// plain `git clone` + `npm install` keeps using the default public registry.
//
// Detection is best-effort: any error results in "do nothing" so installs are
// never broken by a detection failure. It uses Node built-ins only, because it
// runs before dependencies are installed.
//
// ONE intentional exception: on a local Microsoft dev machine's FIRST install
// (when we had to bootstrap a brand new .npmrc), we exit non-zero. npm loads
// its config at startup -- before this hook runs -- so the registry we just
// wrote does not apply to the current install. Failing fast with clear
// instructions is better than letting npm proceed against the wrong (blocked)
// registry and surface a cryptic network error. The exists-check above makes
// the follow-up `npm install` a no-op that proceeds normally. This never fires
// in CI or for public contributors.

const { getEnvironment } = require('./buildEnv.js');
const { existsSync } = require('fs');
const { join } = require('path');
const setupNpmrc = require('./setupNpmrc.js');

const npmrcPath = join(__dirname, '..', '.npmrc');

function main() {
    // If an .npmrc already exists (e.g. a developer configured one manually, or
    // a previous run wrote it), leave it untouched and do nothing.
    if (existsSync(npmrcPath)) {
        return;
    }

    const buildEnv = getEnvironment();
    if (!buildEnv) {
        return;
    }

    setupNpmrc.run(buildEnv);

    // Local Microsoft dev, first run: stop so the developer can authenticate and
    // re-run against the freshly bootstrapped registry. CI (azure-devops)
    // configures + authenticates the feed in dedicated pipeline steps, so it
    // must NOT hard-fail here.
    if (buildEnv.type === 'microsoft-user') {
        console.error(
            [
                '',
                '[setup:npmrc] Bootstrapped the azfunc registry into .npmrc.',
                'npm had already loaded its config for this run, so it will not use the',
                'new registry until the next invocation. To finish first-time setup:',
                '',
                '  1. npx better-vsts-npm-auth -c .npmrc',
                '  2. npm install   (re-run)',
                '',
            ].join('\n')
        );
        process.exit(1);
    }
}

try {
    main();
} catch (err) {
    // Best-effort only: never break `npm install` due to a detection failure.
    console.warn(`[setup:npmrc] skipped (best-effort detection failed): ${err && err.message}`);
}
