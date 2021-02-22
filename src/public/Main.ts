import { Context } from "./Interfaces"; 
export * from "./Interfaces";

/**
 * Interface for your Azure Function code. This function must be exported (via module.exports or exports) 
 * and will execute when triggered. It is recommended that you declare this function as async, which 
 * implicitly returns a Promise.
 * @param context Context object passed to your function from the Azure Functions runtime.
 * @param {any[]} args Optional array of input and trigger binding data. These binding data are passed to the 
 * function in the same order that they are defined in function.json. Valid input types are string, HttpRequest, 
 * and Buffer.
 * @returns Output bindings (optional). If you are returning a result from a Promise (or an async function), this 
 * result will be passed to JSON.stringify unless it is a string, Buffer, ArrayBufferView, or number.
 */
export type AzureFunction = ((context: Context, ...args: any[]) => Promise<any> | void);