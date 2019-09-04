const logPrefix = "LanguageWorkerConsoleLog";

export function systemLog(message?: any, ...optionalParams: any[]) { 
    console.log(logPrefix + removeNewLines(message), ...optionalParams); 
};

export function systemWarn(message?: any, ...optionalParams: any[]) { 
    console.warn(logPrefix + "[warn] " + removeNewLines(message), ...optionalParams); 
};

export function systemError(message?: any, ...optionalParams: any[]) { 
    console.error(logPrefix + "[error] " + removeNewLines(message), ...optionalParams); 
};

function removeNewLines(message?: any): string {
    if (message && typeof message === 'string') {
        message = message.replace(/(\r\n|\n|\r)/gm, " ");
    }
    return message;
}