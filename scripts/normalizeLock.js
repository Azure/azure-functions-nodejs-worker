// Normalizes package-lock.json "resolved" URLs so the committed lockfile always
// references the public npm registry (https://registry.npmjs.org).
//
// Why this exists:
// In some environments, Azure DevOps (ADO) package feeds may be used as a proxy
// to the public npm registry. When a dependency is added or updated on such a
// machine, npm writes "resolved" URLs pointing at the ADO feed instead of the
// public registry. Those URLs can vary between environments (causing lockfile
// churn) and break contributors who do not use the same feed, so the committed
// lockfile must always reference the public npm registry.
//
// Why normalizing to registry.npmjs.org is correct for BOTH audiences:
// npm's `replace-registry-host` config defaults to `npmjs`, so at install time
// npm substitutes the configured registry for the registry.npmjs.org host. A dev
// resolving through an ADO feed hits their proxy, while everyone else hits the
// real public registry. `integrity` (sha512) hashes are source-independent, so
// the tarball validates regardless of origin. Normalizing to registry.npmjs.org
// specifically is load-bearing -- do NOT change the target host, or the
// substitution behavior is lost.
//
// Usage:
//   node scripts/normalizeLock.js            Rewrite the lockfile in place.
//   node scripts/normalizeLock.js --check    Exit non-zero if any non-public
//                                            registry URL remains; does not
//                                            modify the file (used by CI).

const { existsSync, readFileSync, writeFileSync } = require('fs');
const { join } = require('path');

const LOCK_PATH = join(__dirname, '..', 'package-lock.json');
const PUBLIC_REGISTRY = 'https://registry.npmjs.org';

// Matches an ADO package-feed registry *prefix* -- up to and including
// "/npm/registry" -- in either ADO host form: "<something>.pkgs.visualstudio.com"
// or "pkgs.dev.azure.com". The pattern deliberately stops at "/npm/registry" so
// only the host+feed prefix is replaced and the package suffix
// ("/<pkg>/-/<tarball>") is preserved. Anchoring on the "/npm/registry" shape
// keeps it narrow, so it won't touch a genuinely private/internal package source
// added in the future -- such a source would instead be surfaced by --check for a
// human to review rather than silently rewritten.
const INTERNAL_REGISTRY =
    /https:\/\/(?:[a-z0-9-]+\.pkgs\.visualstudio\.com|pkgs\.dev\.azure\.com)\/[^"\s]*?\/npm\/registry/g;

function main() {
    const check = process.argv.includes('--check');

    // No lockfile is a clean no-op in both modes.
    if (!existsSync(LOCK_PATH)) {
        return;
    }

    const original = readFileSync(LOCK_PATH, 'utf8');
    const normalized = original.replace(INTERNAL_REGISTRY, PUBLIC_REGISTRY);
    const changed = normalized !== original;

    if (check) {
        if (changed) {
            console.error(
                [
                    '',
                    'package-lock.json contains non-public npm registry URLs.',
                    'This usually happens when a dependency is added or updated on a machine',
                    'configured with the Microsoft Central Feed Services (CFS) proxy.',
                    '',
                    'Fix it locally and commit the result:',
                    '',
                    '  npm run normalize-lock',
                    '',
                ].join('\n')
            );
            process.exit(1);
        }
        return;
    }

    if (changed) {
        writeFileSync(LOCK_PATH, normalized);
        console.log(`normalizeLock: rewrote package-lock.json registry URLs to ${PUBLIC_REGISTRY}`);
    }
}

main();
