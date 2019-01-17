const logPrefix = "LanguageWorkerConsoleLog";

export function systemLog(message?: any, ...optionalParams: any[]) { 
    console.log(logPrefix + message, ...optionalParams); 
};

export function systemWarn(message?: any, ...optionalParams: any[]) { 
    console.warn(logPrefix + "[warn] " + message, ...optionalParams); 
};

export function systemError(message?: any, ...optionalParams: any[]) { 
    console.error(logPrefix + "[error] " + message, ...optionalParams); 
};