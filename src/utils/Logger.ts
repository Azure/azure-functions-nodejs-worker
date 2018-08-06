const logPrefix = "LanguageWorkerConsoleLog";

export function systemLog(message?: any, ...optionalParams: any[]) { 
    console.log(logPrefix + message, optionalParams); 
};

export function systemError(message?: any, ...optionalParams: any[]) { 
    console.error(logPrefix + message, optionalParams); 
};