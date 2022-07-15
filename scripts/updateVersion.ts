// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { execSync } from 'child_process';
import { readFileSync, readJSONSync, writeFileSync } from 'fs-extra';
import * as parseArgs from 'minimist';
import * as path from 'path';
import * as semver from 'semver';

const repoRoot = path.join(__dirname, '..');
const packageJsonPath = path.join(repoRoot, 'package.json');
const constantsPath = path.join(repoRoot, 'src', 'constants.ts');
const constantsVersionRegex = /version = '(.*)'/i;

const args = parseArgs(process.argv.slice(2));
if (args.validate) {
    validateVersion();
} else if (args.version) {
    updateVersion(args.version);
} else {
    console.log(`This script can be used to either update the version of the worker or validate that the repo is in a valid state with regards to versioning.

Example usage:

npm run updateVersion -- --version 3.3.0

npm run updateVersion -- --validate`);
    throw new Error('Invalid arguments');
}

function validateVersion() {
    const packageJson = readJSONSync(packageJsonPath);
    const packageJsonVersion = packageJson.version;

    const constantsVersion = getVersion(constantsPath, constantsVersionRegex);

    console.log('Found the following versions:');
    console.log(`- package.json: ${packageJsonVersion}`);
    console.log(`- src/constants.ts: ${constantsVersion}`);

    const parsedVersion = semver.parse(packageJsonVersion);

    if (!packageJsonVersion || !constantsVersion || !parsedVersion) {
        throw new Error('Failed to detect valid versions in all expected files');
    } else if (constantsVersion !== packageJsonVersion) {
        throw new Error(`Worker versions do not match.`);
    } else {
        console.log('Versions match! 🎉');
    }
}

function getVersion(filePath: string, regex: RegExp): string {
    const fileContents = readFileSync(filePath).toString();
    const match = fileContents.match(regex);
    if (!match) {
        throw new Error(`Failed to find match for "${regex.source}".`);
    }
    return match[1];
}

function updateVersion(newVersion: string) {
    updatePackageJsonVersion(repoRoot, newVersion);

    updateVersionByRegex(constantsPath, constantsVersionRegex, newVersion);
}

function updatePackageJsonVersion(cwd: string, newVersion: string) {
    execSync(`npm version ${newVersion} --no-git-tag-version --allow-same-version`, { cwd });
    console.log(`Updated ${cwd}/package.json to version ${newVersion}`);
}

function updateVersionByRegex(filePath: string, regex: RegExp, newVersion: string) {
    const oldFileContents = readFileSync(filePath).toString();
    const match = oldFileContents.match(regex);
    if (!match) {
        throw new Error(`Failed to find match for "${regex.source}".`);
    }
    const oldLine = match[0];
    const oldVersion = match[1];
    const newLine = oldLine.replace(oldVersion, newVersion);
    const newFileContents = oldFileContents.replace(oldLine, newLine);
    writeFileSync(filePath, newFileContents);
    console.log(`Updated ${filePath} from ${oldVersion} to version ${newVersion}`);
}
