export function systemLog(message?: any, ...optionalParams: any[]) { 
    console.log(`LANGUAGE_WORKER_LOG${message}`, optionalParams); 
};

export function systemError(message?: any, ...optionalParams: any[]) { 
    console.error(`LANGUAGE_WORKER_LOG${message}`, optionalParams); 
};