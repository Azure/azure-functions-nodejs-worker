// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { AzureFunction, Context, Logger } from '@azure/functions';

/**
 * This module is shipped as a built-in part of the Azure Functions Node.js worker and is available at runtime
 */
declare module '@azure/functions-core' {
    /**
     * The version of the Node.js worker
     */
    export const version: string;

    /**
     * Register a hook to interact with the lifecycle of Azure Functions.
     * Hooks are executed in the order they were registered and will block execution if they throw an error
     */
    export function registerHook(hookName: 'preInvocation', callback: PreInvocationCallback): Disposable;
    export function registerHook(hookName: 'postInvocation', callback: PostInvocationCallback): Disposable;
    export function registerHook(hookName: 'appStartup', callback: AppStartupCallback): Disposable;
    export function registerHook(hookName: 'appTeardown', callback: AppTeardownCallback): Disposable;
    export function registerHook(hookName: string, callback: HookCallback): Disposable;

    export type HookCallback = (context: HookContext) => void | Promise<void>;
    export type PreInvocationCallback = (context: PreInvocationContext) => void | Promise<void>;
    export type PostInvocationCallback = (context: PostInvocationContext) => void | Promise<void>;
    export type AppStartupCallback = (context: AppStartupContext) => void | Promise<void>;
    export type AppTeardownCallback = (context: AppTeardownCallback) => void | Promise<void>;

    export type HookData = { [key: string]: any };

    /**
     * Base interface for all hook context objects
     */
    export interface HookContext {
        /**
         * The recommended place to share data between hooks
         */
        hookData: HookData;
        /**
         * The recommended place to emit logs
         */
        logger: Logger;
    }

    /**
     * Context on a function that is about to be executed
     * This object will be passed to all pre invocation hooks
     */
    export interface PreInvocationContext extends HookContext {
        /**
         * The context object passed to the function
         */
        invocationContext: Context;

        /**
         * The input values for this specific invocation. Changes to this array _will_ affect the inputs passed to your function
         */
        inputs: any[];

        /**
         * The function callback for this specific invocation. Changes to this value _will_ affect the function itself
         */
        functionCallback: AzureFunction;
    }

    /**
     * Context on a function that has just executed
     * This object will be passed to all post invocation hooks
     */
    export interface PostInvocationContext extends HookContext {
        /**
         * The context object passed to the function
         */
        invocationContext: Context;

        /**
         * The input values for this specific invocation
         */
        inputs: any[];

        /**
         * The result of the function, or null if there is no result. Changes to this value _will_ affect the overall result of the function
         */
        result: any;

        /**
         * The error for the function, or null if there is no error. Changes to this value _will_ affect the overall result of the function
         */
        error: any;
    }

    /**
     * Context on a function app that is about to be started
     * This object will be passed to all app startup hooks
     */
    export interface AppStartupContext extends HookContext {
        /**
         * Absolute directory of the function app
         */
        functionAppDirectory: string;
        /**
         * The version of the host running the function app
         */
        hostVersion: string;
    }

    /**
     * Context on a function app that is about to be deallocated
     * This object will be passed to all app teardown hooks
     */
    export interface AppTeardownContext extends HookContext {
        /**
         * Absolute directory of the function app
         */
        functionAppDirectory: string;
    }

    /**
     * Represents a type which can release resources, such as event listening or a timer.
     */
    export class Disposable {
        /**
         * Combine many disposable-likes into one. You can use this method when having objects with a dispose function which aren't instances of `Disposable`.
         *
         * @param disposableLikes Objects that have at least a `dispose`-function member. Note that asynchronous dispose-functions aren't awaited.
         * @return Returns a new disposable which, upon dispose, will dispose all provided disposables.
         */
        static from(...disposableLikes: { dispose: () => any }[]): Disposable;

        /**
         * Creates a new disposable that calls the provided function on dispose.
         * *Note* that an asynchronous function is not awaited.
         *
         * @param callOnDispose Function that disposes something.
         */
        constructor(callOnDispose: () => any);

        /**
         * Dispose this object.
         */
        dispose(): any;
    }
}
