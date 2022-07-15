// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

/**
 * This module is shipped as a built-in part of the Azure Functions Node.js worker and is available at runtime
 */
declare module '@azure/functions-core' {
    /**
     * The version of the Node.js worker
     */
    const version: string;

    /**
     * Register a hook to interact with the lifecycle of Azure Functions.
     * Hooks are executed in the order they were registered and will block execution if they throw an error
     */
    function registerHook<TContext = unknown>(
        hookName: 'preInvocation',
        callback: PreInvocationCallback<TContext>
    ): Disposable;
    function registerHook<TContext = unknown>(
        hookName: 'postInvocation',
        callback: PostInvocationCallback<TContext>
    ): Disposable;
    function registerHook(hookName: 'appStart', callback: AppStartCallback): Disposable;
    function registerHook(hookName: string, callback: HookCallback): Disposable;

    type HookCallback = (context: HookContext) => void | Promise<void>;
    type PreInvocationCallback<TContext = unknown> = (context: PreInvocationContext<TContext>) => void | Promise<void>;
    type PostInvocationCallback<TContext = unknown> = (
        context: PostInvocationContext<TContext>
    ) => void | Promise<void>;
    type AppStartCallback = (context: AppStartContext) => void | Promise<void>;

    type HookData = { [key: string]: any };

    /**
     * Base interface for all hook context objects
     */
    interface HookContext {
        /**
         * The recommended place to share data between hooks in the same scope (app-level vs invocation-level)
         */
        hookData: HookData;
        /**
         * The recommended place to share data across scopes for all hooks
         */
        appHookData: HookData;
    }

    /**
     * Context on a function that is about to be executed
     * This object will be passed to all pre invocation hooks
     */
    interface PreInvocationContext<TContext = unknown> extends HookContext {
        /**
         * The context object passed to the function
         */
        invocationContext: TContext;

        /**
         * The input values for this specific invocation. Changes to this array _will_ affect the inputs passed to your function
         */
        inputs: any[];

        /**
         * The function callback for this specific invocation. Changes to this value _will_ affect the function itself
         */
        functionCallback: FunctionCallback<TContext>;
    }

    /**
     * Context on a function that has just executed
     * This object will be passed to all post invocation hooks
     */
    interface PostInvocationContext<TContext = unknown> extends HookContext {
        /**
         * The context object passed to the function
         */
        invocationContext: TContext;

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
     * This object will be passed to all app start hooks
     */
    interface AppStartContext extends HookContext {
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
     * Represents a type which can release resources, such as event listening or a timer.
     */
    class Disposable {
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

    /**
     * Registers the main programming model to be used for a Node.js function app
     * Only one programming model can be set. The last programming model registered will be used
     * If not explicitly set, a default programming model included with the worker will be used
     */
    function setProgrammingModel<TContext>(programmingModel: ProgrammingModel<TContext>): void;

    /**
     * Returns the currently registered programming model
     * If not explicitly set, a default programming model included with the worker will be used
     */
    function getProgrammingModel<TContext>(): ProgrammingModel<TContext>;

    /**
     * A set of information and methods that describe the model for handling a Node.js function app
     * Currently, this is mainly focused on invocation
     */
    interface ProgrammingModel<TContext> {
        /**
         * A name for this programming model, generally only used for tracking purposes
         */
        name: string;

        /**
         * A version for this programming model, generally only used for tracking purposes
         */
        version: string;

        /**
         * Returns a new instance of the invocation model for each invocation
         */
        getInvocationModel(coreContext: CoreInvocationContext): InvocationModel<TContext>;
    }

    /**
     * Basic information and helper methods about an invocation provided from the core worker to the programming model
     */
    interface CoreInvocationContext {
        /**
         * A guid unique to this invocation
         */
        invocationId: string;

        /**
         * The invocation request received by the worker from the host
         */
        request: RpcInvocationRequest;

        /**
         * Metadata about the function
         */
        metadata: RpcFunctionMetadata;

        /**
         * Describes the current state of invocation, or undefined if between states
         */
        state?: InvocationState;

        /**
         * The recommended way to log information
         */
        log(level: RpcLog.Level, category: RpcLog.RpcLogCategory, message: string): void;
    }

    type InvocationState = 'preInvocationHooks' | 'postInvocationHooks' | 'invocation';

    /**
     * A set of methods that describe the model for invoking a function
     */
    interface InvocationModel<TContext> {
        /**
         * Returns the context object and inputs to be passed to all following invocation methods
         * This is run before preInvocation hooks
         */
        getArguments(): Promise<InvocationArguments<TContext>>;

        /**
         * The main method that executes the user's function callback
         * This is run between preInvocation and postInvocation hooks
         * @param context The context object returned in `getArguments`, potentially modified by preInvocation hooks
         * @param inputs The input array returned in `getArguments`, potentially modified by preInvocation hooks
         * @param callback The function callback to be executed
         */
        invokeFunction(context: TContext, inputs: unknown[], callback: FunctionCallback<TContext>): Promise<unknown>;

        /**
         * Returns the invocation response to send back to the host
         * This is run after postInvocation hooks
         * @param context The context object created in `getArguments`
         * @param result The result of the function callback, potentially modified by postInvocation hooks
         */
        getResponse(context: TContext, result: unknown): Promise<RpcInvocationResponse>;
    }

    interface InvocationArguments<TContext> {
        /**
         * This is always the first argument passed to a function callback
         */
        context: TContext;

        /**
         * The remaining arguments passed to a function callback, generally describing the trigger/input bindings
         */
        inputs: unknown[];
    }

    type FunctionCallback<TContext = unknown> = (context: TContext, ...inputs: unknown[]) => unknown;

    // #region rpc types
    interface RpcFunctionMetadata {
        name?: string | null;

        directory?: string | null;

        scriptFile?: string | null;

        entryPoint?: string | null;

        bindings?: { [k: string]: RpcBindingInfo } | null;

        isProxy?: boolean | null;

        status?: RpcStatusResult | null;

        language?: string | null;

        rawBindings?: string[] | null;

        functionId?: string | null;

        managedDependencyEnabled?: boolean | null;
    }

    interface RpcStatusResult {
        status?: RpcStatusResult.Status | null;

        result?: string | null;

        exception?: RpcException | null;

        logs?: RpcLog[] | null;
    }

    namespace RpcStatusResult {
        enum Status {
            Failure = 0,
            Success = 1,
            Cancelled = 2,
        }
    }

    interface RpcLog {
        invocationId?: string | null;

        category?: string | null;

        level?: RpcLog.Level | null;

        message?: string | null;

        eventId?: string | null;

        exception?: RpcException | null;

        logCategory?: RpcLog.RpcLogCategory | null;
    }

    namespace RpcLog {
        enum Level {
            Trace = 0,
            Debug = 1,
            Information = 2,
            Warning = 3,
            Error = 4,
            Critical = 5,
            None = 6,
        }

        enum RpcLogCategory {
            User = 0,
            System = 1,
            CustomMetric = 2,
        }
    }

    interface RpcException {
        source?: string | null;

        stackTrace?: string | null;

        message?: string | null;
    }

    interface RpcBindingInfo {
        type?: string | null;

        direction?: RpcBindingInfo.Direction | null;

        dataType?: RpcBindingInfo.DataType | null;
    }

    namespace RpcBindingInfo {
        enum Direction {
            in = 0,
            out = 1,
            inout = 2,
        }

        enum DataType {
            undefined = 0,
            string = 1,
            binary = 2,
            stream = 3,
        }
    }

    interface RpcTypedData {
        string?: string | null;

        json?: string | null;

        bytes?: Uint8Array | null;

        stream?: Uint8Array | null;

        http?: RpcHttpData | null;

        int?: number | Long | null;

        double?: number | null;

        collectionBytes?: RpcCollectionBytes | null;

        collectionString?: RpcCollectionString | null;

        collectionDouble?: RpcCollectionDouble | null;

        collectionSint64?: RpcCollectionSInt64 | null;
    }

    interface RpcCollectionSInt64 {
        sint64?: (number | Long)[] | null;
    }

    interface RpcCollectionString {
        string?: string[] | null;
    }

    interface RpcCollectionBytes {
        bytes?: Uint8Array[] | null;
    }

    interface RpcCollectionDouble {
        double?: number[] | null;
    }

    interface RpcInvocationRequest {
        invocationId?: string | null;

        functionId?: string | null;

        inputData?: RpcParameterBinding[] | null;

        triggerMetadata?: { [k: string]: RpcTypedData } | null;

        traceContext?: RpcTraceContext | null;

        retryContext?: RpcRetryContext | null;
    }

    interface RpcTraceContext {
        traceParent?: string | null;

        traceState?: string | null;

        attributes?: { [k: string]: string } | null;
    }

    interface RpcRetryContext {
        retryCount?: number | null;

        maxRetryCount?: number | null;

        exception?: RpcException | null;
    }

    interface RpcInvocationResponse {
        invocationId?: string | null;

        outputData?: RpcParameterBinding[] | null;

        returnValue?: RpcTypedData | null;

        result?: RpcStatusResult | null;
    }

    interface RpcParameterBinding {
        name?: string | null;

        data?: RpcTypedData | null;
    }

    interface RpcHttpData {
        method?: string | null;

        url?: string | null;

        headers?: { [k: string]: string } | null;

        body?: RpcTypedData | null;

        params?: { [k: string]: string } | null;

        statusCode?: string | null;

        query?: { [k: string]: string } | null;

        enableContentNegotiation?: boolean | null;

        rawBody?: RpcTypedData | null;

        cookies?: RpcHttpCookie[] | null;

        nullableHeaders?: { [k: string]: RpcNullableString } | null;

        nullableParams?: { [k: string]: RpcNullableString } | null;

        nullableQuery?: { [k: string]: RpcNullableString } | null;
    }

    interface RpcHttpCookie {
        name?: string | null;

        value?: string | null;

        domain?: RpcNullableString | null;

        path?: RpcNullableString | null;

        expires?: RpcNullableTimestamp | null;

        secure?: RpcNullableBool | null;

        httpOnly?: RpcNullableBool | null;

        sameSite?: RpcHttpCookie.SameSite | null;

        maxAge?: RpcNullableDouble | null;
    }

    interface RpcNullableString {
        value?: string | null;
    }

    interface RpcNullableDouble {
        value?: number | null;
    }

    interface RpcNullableBool {
        value?: boolean | null;
    }

    interface RpcNullableTimestamp {
        value?: RpcTimestamp | null;
    }

    interface RpcTimestamp {
        seconds?: number | Long | null;

        nanos?: number | null;
    }

    namespace RpcHttpCookie {
        enum SameSite {
            None = 0,
            Lax = 1,
            Strict = 2,
            ExplicitNone = 3,
        }
    }
    // #endregion rpc types
}
