const { execFileSync } = require('child_process');

const MICROSOFT_DOMAIN = '@microsoft.com';

/**
 * Extracts the Azure DevOps organization name from a collection URI. Handles
 * both supported URI formats:
 *   - https://dev.azure.com/{org}/
 *   - https://{org}.visualstudio.com/
 *
 * @param {string | undefined} orgUri
 * @returns {string | undefined} The organization name, or undefined if it
 *   cannot be determined.
 */
function parseOrgFromUri(orgUri) {
    if (!orgUri) {
        return undefined;
    }

    let url;
    try {
        url = new URL(orgUri);
    } catch {
        return undefined;
    }

    const host = url.hostname.toLowerCase();

    // https://dev.azure.com/{org}/...
    if (host === 'dev.azure.com') {
        const org = url.pathname.split('/').filter(Boolean)[0];
        return org || undefined;
    }

    // https://{org}.visualstudio.com/...
    if (host.endsWith('.visualstudio.com')) {
        const org = host.slice(0, -'.visualstudio.com'.length);
        return org || undefined;
    }

    return undefined;
}

/**
 * @returns {{ org: string | undefined, project: string | undefined } | null}
 *   The Azure DevOps context, or null when not running in a pipeline.
 */
function getDevopsEnvironment() {
    if (String(process.env.TF_BUILD).toLowerCase() !== 'true') {
        return null;
    }
    return {
        org: parseOrgFromUri(process.env.SYSTEM_TEAMFOUNDATIONCOLLECTIONURI),
        project: process.env.SYSTEM_TEAMPROJECT,
    };
}

/**
 * Runs a command and returns trimmed stdout, or '' on any failure.
 * @param {string} cmd
 * @param {string[]} args
 * @returns {string}
 */
function tryExec(cmd, args) {
    try {
        return execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 })
            .toString()
            .trim();
    } catch {
        return '';
    }
}

/**
 * Best-effort, cross-platform check for a Microsoft corp identity.
 * Signals (any match wins):
 *   - git user.email ending in @microsoft.com (all platforms)
 *   - Windows Entra UPN via `whoami /upn`
 *   - Windows domain environment variables
 *   - macOS Microsoft Enterprise SSO plugin via `app-sso`
 *   - Kerberos ticket principal in a *.microsoft.com realm (macOS + Linux)
 * @returns {boolean}
 */
function isLikelyMicrosoftUser() {
    const gitEmail = tryExec('git', ['config', '--get', 'user.email']).toLowerCase();
    if (gitEmail.endsWith(MICROSOFT_DOMAIN)) {
        return true;
    }

    // Windows / Entra-joined machines expose the corp UPN (alias@microsoft.com).
    if (process.platform === 'win32') {
        const upn = tryExec('whoami', ['/upn']).toLowerCase();
        if (upn.endsWith(MICROSOFT_DOMAIN)) {
            return true;
        }

        const domains = [process.env.USERDNSDOMAIN, process.env.USERDOMAIN]
            .filter(Boolean)
            .map((d) => d.toLowerCase());
        if (domains.some((d) => d.includes('microsoft'))) {
            return true;
        }
    }

    // macOS Macs enrolled in Intune run the Microsoft Enterprise SSO extension,
    // which surfaces the signed-in UPN via `app-sso`.
    if (process.platform === 'darwin') {
        if (/@microsoft\.com/i.test(tryExec('app-sso', ['platform', '-s']))) {
            return true;
        }
    }

    // Corp-joined macOS and Linux (and WSL) machines often hold a Kerberos TGT
    // whose principal is in a Microsoft realm, e.g.
    // alias@REDMOND.CORP.MICROSOFT.COM.
    if (process.platform === 'darwin' || process.platform === 'linux') {
        if (/[\w.-]+@[\w.-]*microsoft\.com/i.test(tryExec('klist', []))) {
            return true;
        }
    }

    return false;
}

function getEnvironment() {
    const ado = getDevopsEnvironment();
    if (ado && ado.org === 'azfunc') {
        return { type: "azure-devops", project: ado.project };
    }

    const isMicrosoft = isLikelyMicrosoftUser();
    if (isMicrosoft) {
        return { type: "microsoft-user" };
    }

    return null;
}

module.exports = { getEnvironment };
