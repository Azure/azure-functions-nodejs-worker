// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

declare module '@azure/functions' {
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
    export type AzureFunction = (context: Context, ...args: any[]) => Promise<any> | void;

    /**
     * Context bindings object. Provided to your function binding data, as defined in function.json.
     */
    export interface ContextBindings {
        [name: string]: any;
    }
    /**
     * Context binding data. Provided to your function trigger metadata and function invocation data.
     */
    export interface ContextBindingData {
        /**
         * A unique GUID per function invocation.
         */
        invocationId: string;

        [name: string]: any;
    }
    /**
     * The context object can be used for writing logs, reading data from bindings, setting outputs and using
     * the context.done callback when your exported function is synchronous. A context object is passed
     * to your function from the Azure Functions runtime on function invocation.
     */
    export interface Context {
        /**
         * A unique GUID per function invocation.
         */
        invocationId: string;
        /**
         * Function execution metadata.
         */
        executionContext: ExecutionContext;
        /**
         * Input and trigger binding data, as defined in function.json. Properties on this object are dynamically
         * generated and named based off of the "name" property in function.json.
         */
        bindings: ContextBindings;
        /**
         * Trigger metadata and function invocation data.
         */
        bindingData: ContextBindingData;
        /**
         * TraceContext information to enable distributed tracing scenarios.
         */
        traceContext: TraceContext;
        /**
         * Bindings your function uses, as defined in function.json.
         */
        bindingDefinitions: BindingDefinition[];
        /**
         * Allows you to write streaming function logs. Calling directly allows you to write streaming function logs
         * at the default trace level.
         */
        log: Logger;
        /**
         * A callback function that signals to the runtime that your code has completed. If your function is synchronous,
         * you must call context.done at the end of execution. If your function is asynchronous, you should not use this
         * callback.
         *
         * @param err A user-defined error to pass back to the runtime. If present, your function execution will fail.
         * @param result An object containing output binding data. `result` will be passed to JSON.stringify unless it is
         *  a string, Buffer, ArrayBufferView, or number.
         */
        done(err?: Error | string | null, result?: any): void;
        /**
         * HTTP request object. Provided to your function when using HTTP Bindings.
         */
        req?: HttpRequest;
        /**
         * HTTP response object. Provided to your function when using HTTP Bindings.
         */
        res?: {
            [key: string]: any;
        };
    }
    /**
     * HTTP request headers.
     */
    export interface HttpRequestHeaders {
        [name: string]: string;
    }
    /**
     * HTTP response headers.
     */
    export interface HttpResponseHeaders {
        [name: string]: string;
    }
    /**
     * Query string parameter keys and values from the URL.
     */
    export interface HttpRequestQuery {
        [name: string]: string;
    }
    /**
     * Route parameter keys and values.
     */
    export interface HttpRequestParams {
        [name: string]: string;
    }
    /**
     *  Object representing logged-in user, either through
     *  AppService/Functions authentication, or SWA Authentication
     */
    export interface HttpRequestUser {
        /**
         * Type of authentication, either AppService or StaticWebApps
         */
        type: HttpRequestUserType;
        /**
         * unique user GUID
         */
        id: string;
        /**
         * unique username
         */
        username: string;
        /**
         * provider of authentication service
         */
        identityProvider: string;
        /**
         * Extra authentication information, dependent on auth type
         * and auth provider
         */
        claimsPrincipalData: {
            [key: string]: any;
        };
    }
    /**
     * HTTP request object. Provided to your function when using HTTP Bindings.
     */
    export interface HttpRequest {
        /**
         * HTTP request method used to invoke this function.
         */
        method: HttpMethod | null;
        /**
         * Request URL.
         */
        url: string;
        /**
         * HTTP request headers.
         */
        headers: HttpRequestHeaders;
        /**
         * Query string parameter keys and values from the URL.
         */
        query: HttpRequestQuery;
        /**
         * Route parameter keys and values.
         */
        params: HttpRequestParams;
        /**
         *  Object representing logged-in user, either through
         *  AppService/Functions authentication, or SWA Authentication
         *  null when no such user is logged in.
         */
        user: HttpRequestUser | null;
        /**
         * The HTTP request body.
         */
        body?: any;
        /**
         * The HTTP request body as a UTF-8 string.
         */
        rawBody?: any;

        /**
         * Parses the body and returns an object representing a form
         * @throws if the content type is not "multipart/form-data" or "application/x-www-form-urlencoded"
         */
        parseFormBody(): Form;
    }

    export interface Form extends Iterable<[string, FormPart]> {
        /**
         * Returns the value of the first name-value pair whose name is `name`. If there are no such pairs, `null` is returned.
         */
        get(name: string): FormPart | null;

        /**
         * Returns the values of all name-value pairs whose name is `name`. If there are no such pairs, an empty array is returned.
         */
        getAll(name: string): FormPart[];

        /**
         * Returns `true` if there is at least one name-value pair whose name is `name`.
         */
        has(name: string): boolean;

        /**
         * The number of parts in this form
         */
        length: number;
    }

    export interface FormPart {
        /**
         * The value for this part of the form
         */
        value: Buffer;

        /**
         * The file name for this part of the form, if specified
         */
        fileName?: string;

        /**
         * The content type for this part of the form, assumed to be "text/plain" if not specified
         */
        contentType?: string;
    }

    /**
     * Possible values for an HTTP request method.
     */
    export type HttpMethod = 'GET' | 'POST' | 'DELETE' | 'HEAD' | 'PATCH' | 'PUT' | 'OPTIONS' | 'TRACE' | 'CONNECT';
    /**
     * Possible values for an HTTP Request user type
     */
    export type HttpRequestUserType = 'AppService' | 'StaticWebApps';
    /**
     * Http response object and methods.
     * This is the default of the res property in the Context object provided to your function when using HTTP triggers.
     */
    export interface HttpResponseFull {
        /**
         * HTTP response headers.
         */
        headers?: HttpResponseHeaders;
        /**
         *  HTTP response cookies.
         */
        cookies?: Cookie[];
        /**
         * HTTP response body.
         */
        body?: any;
        /**
         * HTTP response status code.
         * @default 200
         */
        statusCode?: number | string;
        /**
         * Enable content negotiation of response body if true
         * If false, treat response body as raw
         * @default false
         */
        enableContentNegotiation?: boolean;
        /**
         * Sets the HTTP response status code
         * @returns the updated HttpResponseFull instance
         */
        status: (statusCode: number | string) => HttpResponseFull;
        /**
         * Sets a particular header field to a value
         * @returns the updated HttpResponseFull instance
         */
        setHeader(field: string, val: any): HttpResponseFull;
        /**
         * Has the same functionality as setHeader.
         * Sets a particular header field to a value
         * @returns the updated HttpResponseFull instance
         */
        header(field: string, val: any): HttpResponseFull;
        /**
         * Has the same functionality as setHeader.
         * Sets a particular header field to a value
         * @returns the updated HttpResponseFull instance
         */
        set(field: string, val: any): HttpResponseFull;
        /**
         * Get the value of a particular header field
         */
        getHeader(field: string): any;
        /**
         * Has the same functionality as getHeader
         * Get the value of a particular header field
         */
        get(field: string): any;
        /**
         * Removes a particular header field
         * @returns the updated HttpResponseFull instance
         */
        removeHeader(field: string): HttpResponseFull;
        /**
         * Set the 'Content-Type' header to a particular value
         * @returns the updated HttpResponseFull instance
         */
        type(type: string): HttpResponseFull;
        /**
         * Automatically sets the content-type then calls context.done()
         * @returns updated HttpResponseFull instance
         * @deprecated this method calls context.done() which is deprecated, use async/await and pass the response as the return value instead.
         * See the docs here for more information: https://aka.ms/functions-js-async-await
         */
        send(body?: any): HttpResponseFull;
        /**
         * Same as send()
         * Automatically sets the content-type then calls context.done()
         * @returns updated HttpResponseFull instance
         * @deprecated this method calls context.done() which is deprecated, use async/await and pass the response as your function's return value instead.
         * See the docs here for more information: https://aka.ms/functions-js-async-await
         */
        end(body?: any): HttpResponseFull;
        /**
         * Sets the status code then calls send()
         * @returns updated HttpResponseFull instance
         * @deprecated this method calls context.done() which is deprecated, use async/await and pass the response as your function's return value instead.
         * See the docs here for more information: https://aka.ms/functions-js-async-await
         */
        sendStatus(statusCode: string | number): HttpResponseFull;
        /**
         * Sets the 'Content-Type' header to 'application/json' then calls send(body)
         * @deprecated this method calls context.done() which is deprecated, use async/await and pass the response as your function's return value instead.
         * See the docs here for more information: https://aka.ms/functions-js-async-await
         */
        json(body?: any): void;
    }
    /**
     * Http response object.
     * This is not the default on the Context object, but you may replace context.res with an object of this type when using HTTP triggers.
     */
    export interface HttpResponseSimple {
        /**
         * HTTP response headers.
         */
        headers?: HttpResponseHeaders;
        /**
         *  HTTP response cookies.
         */
        cookies?: Cookie[];
        /**
         * HTTP response body.
         */
        body?: any;
        /**
         * HTTP response status code.
         * This property takes precedence over the `status` property
         * @default 200
         */
        statusCode?: number | string;
        /**
         * HTTP response status code
         * The same as `statusCode`. This property is ignored if `statusCode` is set
         * @default 200
         */
        status?: number | string;
        /**
         * Enable content negotiation of response body if true
         * If false, treat response body as raw
         * @default false
         */
        enableContentNegotiation?: boolean;
    }
    /**
     * Http response type.
     */
    export type HttpResponse = HttpResponseSimple | HttpResponseFull;

    /**
     * Http response cookie object to "Set-Cookie"
     */
    export interface Cookie {
        /** Cookie name */
        name: string;
        /** Cookie value */
        value: string;
        /** Specifies allowed hosts to receive the cookie */
        domain?: string;
        /** Specifies URL path that must exist in the requested URL */
        path?: string;
        /**
         * NOTE: It is generally recommended that you use maxAge over expires.
         * Sets the cookie to expire at a specific date instead of when the client closes.
         * This can be a Javascript Date or Unix time in milliseconds.
         */
        expires?: Date | number;
        /** Sets the cookie to only be sent with an encrypted request */
        secure?: boolean;
        /** Sets the cookie to be inaccessible to JavaScript's Document.cookie API */
        httpOnly?: boolean;
        /** Can restrict the cookie to not be sent with cross-site requests */
        sameSite?: 'Strict' | 'Lax' | 'None' | undefined;
        /** Number of seconds until the cookie expires. A zero or negative number will expire the cookie immediately. */
        maxAge?: number;
    }
    export interface ExecutionContext {
        /**
         * A unique GUID per function invocation.
         */
        invocationId: string;
        /**
         * The name of the function that is being invoked. The name of your function is always the same as the
         * name of the corresponding function.json's parent directory.
         */
        functionName: string;
        /**
         * The directory your function is in (this is the parent directory of this function's function.json).
         */
        functionDirectory: string;
        /**
         * The retry context of the current function execution or null if the retry policy is not defined.
         */
        retryContext: RetryContext | null;
    }
    export interface RetryContext {
        /**
         * Current retry count of the function executions.
         */
        retryCount: number;
        /**
         * Max retry count is the maximum number of times an execution is retried before eventual failure. A value of -1 means to retry indefinitely.
         */
        maxRetryCount: number;
        /**
         * Exception that caused the retry
         */
        exception?: Exception;
    }
    export interface Exception {
        /** Exception source */
        source?: string | null;
        /** Exception stackTrace */
        stackTrace?: string | null;
        /** Exception message */
        message?: string | null;
    }
    /**
     * TraceContext information to enable distributed tracing scenarios.
     */
    export interface TraceContext {
        /** Describes the position of the incoming request in its trace graph in a portable, fixed-length format. */
        traceparent: string | null | undefined;
        /** Extends traceparent with vendor-specific data. */
        tracestate: string | null | undefined;
        /** Holds additional properties being sent as part of request telemetry. */
        attributes:
            | {
                  [k: string]: string;
              }
            | null
            | undefined;
    }
    export interface BindingDefinition {
        /**
         * The name of your binding, as defined in function.json.
         */
        name: string;
        /**
         * The type of your binding, as defined in function.json.
         */
        type: string;
        /**
         * The direction of your binding, as defined in function.json.
         */
        direction: 'in' | 'out' | 'inout' | undefined;
    }
    /**
     * Allows you to write streaming function logs.
     */
    export interface Logger {
        /**
         * Writes streaming function logs at the default trace level.
         */
        (...args: any[]): void;
        /**
         * Writes to error level logging or lower.
         */
        error(...args: any[]): void;
        /**
         * Writes to warning level logging or lower.
         */
        warn(...args: any[]): void;
        /**
         * Writes to info level logging or lower.
         */
        info(...args: any[]): void;
        /**
         * Writes to verbose level logging.
         */
        verbose(...args: any[]): void;
    }
    /**
     * Timer schedule information. Provided to your function when using a timer binding.
     */
    export interface Timer {
        /**
         * Whether this timer invocation is due to a missed schedule occurrence.
         */
        isPastDue: boolean;
        schedule: {
            /**
             * Whether intervals between invocations should account for DST.
             */
            adjustForDST: boolean;
        };
        scheduleStatus: {
            /**
             * The last recorded schedule occurrence. Date ISO string.
             */
            last: string;
            /**
             * The expected next schedule occurrence. Date ISO string.
             */
            next: string;
            /**
             * The last time this record was updated. This is used to re-calculate `next` with the current schedule after a host restart. Date ISO string.
             */
            lastUpdated: string;
        };
    }

    /**
     * Interface that defines the schema for package.json files
     * Converted from the package.json schema here: http://json.schemastore.org/package
     * And converted using http://borischerny.com/json-schema-to-typescript-browser/
     */
    export interface PackageJson {
        /**
         * The name of the package.
         */
        name?: string;
        /**
         * Version must be parseable by node-semver, which is bundled with npm as a dependency.
         */
        version?: string;
        /**
         * This helps people discover your package, as it's listed in 'npm search'.
         */
        description?: string;
        /**
         * This helps people discover your package as it's listed in 'npm search'.
         */
        keywords?: string[];
        /**
         * The url to the project homepage.
         */
        homepage?: string;
        /**
         * The url to your project's issue tracker and / or the email address to which issues should be reported. These are helpful for people who encounter issues with your package.
         */
        bugs?:
            | {
                  /**
                   * The url to your project's issue tracker.
                   */
                  url?: string;
                  /**
                   * The email address to which issues should be reported.
                   */
                  email?: string;
                  [k: string]: unknown;
              }
            | string;
        /**
         * You should specify a license for your package so that people know how they are permitted to use it, and any restrictions you're placing on it.
         */
        license?: string;
        /**
         * DEPRECATED: Instead, use SPDX expressions, like this: { "license": "ISC" } or { "license": "(MIT OR Apache-2.0)" } see: 'https://docs.npmjs.com/files/package.json#license'.
         */
        licenses?: {
            type?: string;
            url?: string;
            [k: string]: unknown;
        }[];
        author?: Person;
        /**
         * A list of people who contributed to this package.
         */
        contributors?: Person[];
        /**
         * A list of people who maintains this package.
         */
        maintainers?: Person[];
        /**
         * The 'files' field is an array of files to include in your project. If you name a folder in the array, then it will also include the files inside that folder.
         */
        files?: string[];
        /**
         * The main field is a module ID that is the primary entry point to your program.
         */
        main?: string;
        /**
         * The "exports" field is used to restrict external access to non-exported module files, also enables a module to import itself using "name".
         */
        exports?:
            | (string | null)
            | {
                  /**
                   * The module path that is resolved when the module specifier matches "name", shadows the "main" field.
                   */
                  '.'?: PackageExportsEntry | PackageExportsFallback;
                  /**
                   * The module path prefix that is resolved when the module specifier starts with "name/", set to "./*" to allow external modules to import any subpath.
                   *
                   * This interface was referenced by `undefined`'s JSON-Schema definition
                   * via the `patternProperty` "^\./.+".
                   */
                  [k: string]: PackageExportsEntry | PackageExportsFallback | undefined;
              }
            | {
                  /**
                   * The module path that is resolved when this specifier is imported as a CommonJS module using the `require(...)` function.
                   */
                  require?: PackageExportsEntry | PackageExportsFallback;
                  /**
                   * The module path that is resolved when this specifier is imported as an ECMAScript module using an `import` declaration or the dynamic `import(...)` function.
                   */
                  import?: PackageExportsEntry | PackageExportsFallback;
                  /**
                   * The module path that is resolved when this environment is Node.js.
                   */
                  node?: PackageExportsEntry | PackageExportsFallback;
                  /**
                   * The module path that is resolved when no other export type matches.
                   */
                  default?: PackageExportsEntry | PackageExportsFallback;
                  /**
                   * The module path that is resolved when this environment matches the property name.
                   *
                   * This interface was referenced by `PackageExportsEntryObject`'s JSON-Schema definition
                   * via the `patternProperty` "^(?![\.0-9]).".
                   *
                   * This interface was referenced by `undefined`'s JSON-Schema definition
                   * via the `patternProperty` "^(?![\.0-9]).".
                   */
                  [k: string]: PackageExportsEntry | PackageExportsFallback | undefined;
              }
            | PackageExportsEntry[];
        bin?:
            | string
            | {
                  [k: string]: string;
              };
        /**
         * When set to "module", the type field allows a package to specify all .js files within are ES modules. If the "type" field is omitted or set to "commonjs", all .js files are treated as CommonJS.
         */
        type?: 'commonjs' | 'module';
        /**
         * Set the types property to point to your bundled declaration file.
         */
        types?: string;
        /**
         * Note that the "typings" field is synonymous with "types", and could be used as well.
         */
        typings?: string;
        /**
         * The "typesVersions" field is used since TypeScript 3.1 to support features that were only made available in newer TypeScript versions.
         */
        typesVersions?: {
            /**
             * Contains overrides for the TypeScript version that matches the version range matching the property key.
             */
            [k: string]: {
                /**
                 * Maps all file paths to the file paths specified in the array.
                 */
                '*'?: string[];
            };
        };
        /**
         * Specify either a single file or an array of filenames to put in place for the man program to find.
         */
        man?: string[] | string;
        directories?: {
            /**
             * If you specify a 'bin' directory, then all the files in that folder will be used as the 'bin' hash.
             */
            bin?: string;
            /**
             * Put markdown files in here. Eventually, these will be displayed nicely, maybe, someday.
             */
            doc?: string;
            /**
             * Put example scripts in here. Someday, it might be exposed in some clever way.
             */
            example?: string;
            /**
             * Tell people where the bulk of your library is. Nothing special is done with the lib folder in any way, but it's useful meta info.
             */
            lib?: string;
            /**
             * A folder that is full of man pages. Sugar to generate a 'man' array by walking the folder.
             */
            man?: string;
            test?: string;
            [k: string]: unknown;
        };
        /**
         * Specify the place where your code lives. This is helpful for people who want to contribute.
         */
        repository?:
            | {
                  type?: string;
                  url?: string;
                  directory?: string;
                  [k: string]: unknown;
              }
            | string;
        /**
         * The 'scripts' member is an object hash of script commands that are run at various times in the lifecycle of your package. The key is the lifecycle event, and the value is the command to run at that point.
         */
        scripts?: {
            /**
             * Run code quality tools, e.g. ESLint, TSLint, etc.
             */
            lint?: string;
            /**
             * Run BEFORE the package is published (Also run on local npm install without any arguments).
             */
            prepublish?: string;
            /**
             * Run both BEFORE the package is packed and published, and on local npm install without any arguments. This is run AFTER prepublish, but BEFORE prepublishOnly.
             */
            prepare?: string;
            /**
             * Run BEFORE the package is prepared and packed, ONLY on npm publish.
             */
            prepublishOnly?: string;
            /**
             * run BEFORE a tarball is packed (on npm pack, npm publish, and when installing git dependencies).
             */
            prepack?: string;
            /**
             * Run AFTER the tarball has been generated and moved to its final destination.
             */
            postpack?: string;
            /**
             * Publishes a package to the registry so that it can be installed by name. See https://docs.npmjs.com/cli/v8/commands/npm-publish
             */
            publish?: string;
            postpublish?: ScriptsPublishAfter;
            /**
             * Run BEFORE the package is installed.
             */
            preinstall?: string;
            install?: ScriptsInstallAfter;
            postinstall?: ScriptsInstallAfter;
            preuninstall?: ScriptsUninstallBefore;
            uninstall?: ScriptsUninstallBefore;
            /**
             * Run AFTER the package is uninstalled.
             */
            postuninstall?: string;
            preversion?: ScriptsVersionBefore;
            version?: ScriptsVersionBefore;
            /**
             * Run AFTER bump the package version.
             */
            postversion?: string;
            pretest?: ScriptsTest;
            test?: ScriptsTest;
            posttest?: ScriptsTest;
            prestop?: ScriptsStop;
            stop?: ScriptsStop;
            poststop?: ScriptsStop;
            prestart?: ScriptsStart;
            start?: ScriptsStart;
            poststart?: ScriptsStart;
            prerestart?: ScriptsRestart;
            restart?: ScriptsRestart;
            postrestart?: ScriptsRestart;
            /**
             * Start dev server to serve application files
             */
            serve?: string;
            [k: string]: string | undefined;
        };
        /**
         * A 'config' hash can be used to set configuration parameters used in package scripts that persist across upgrades.
         */
        config?: {
            [k: string]: unknown;
        };
        dependencies?: Dependency;
        devDependencies?: Dependency;
        optionalDependencies?: Dependency;
        peerDependencies?: Dependency;
        /**
         * When a user installs your package, warnings are emitted if packages specified in "peerDependencies" are not already installed. The "peerDependenciesMeta" field serves to provide more information on how your peer dependencies are utilized. Most commonly, it allows peer dependencies to be marked as optional. Metadata for this field is specified with a simple hash of the package name to a metadata object.
         */
        peerDependenciesMeta?: {
            [k: string]: {
                /**
                 * Specifies that this peer dependency is optional and should not be installed automatically.
                 */
                optional?: boolean;
                [k: string]: unknown;
            };
        };
        /**
         * Array of package names that will be bundled when publishing the package.
         */
        bundledDependencies?: string[] | boolean;
        /**
         * DEPRECATED: This field is honored, but "bundledDependencies" is the correct field name.
         */
        bundleDependencies?: string[] | boolean;
        /**
         * Resolutions is used to support selective version resolutions, which lets you define custom package versions or ranges inside your dependencies. See: https://classic.yarnpkg.com/en/docs/selective-version-resolutions
         */
        resolutions?: {
            [k: string]: unknown;
        };
        /**
         * Defines which package manager is expected to be used when working on the current project. This field is currently experimental and needs to be opted-in; see https://nodejs.org/api/corepack.html
         */
        packageManager?: string;
        engines?: {
            node?: string;
            [k: string]: string | undefined;
        };
        engineStrict?: boolean;
        /**
         * Specify which operating systems your module will run on.
         */
        os?: string[];
        /**
         * Specify that your code only runs on certain cpu architectures.
         */
        cpu?: string[];
        /**
         * DEPRECATED: This option used to trigger an npm warning, but it will no longer warn. It is purely there for informational purposes. It is now recommended that you install any binaries as local devDependencies wherever possible.
         */
        preferGlobal?: boolean;
        /**
         * If set to true, then npm will refuse to publish it.
         */
        private?: boolean | ('false' | 'true');
        publishConfig?: {
            access?: 'public' | 'restricted';
            tag?: string;
            registry?: string;
            [k: string]: unknown;
        };
        dist?: {
            shasum?: string;
            tarball?: string;
            [k: string]: unknown;
        };
        readme?: string;
        /**
         * An ECMAScript module ID that is the primary entry point to your program.
         */
        module?: string;
        /**
         * A module ID with untranspiled code that is the primary entry point to your program.
         */
        esnext?:
            | string
            | {
                  main?: string;
                  browser?: string | undefined;
              };
        /**
         * Allows packages within a directory to depend on one another using direct linking of local files. Additionally, dependencies within a workspace are hoisted to the workspace root when possible to reduce duplication. Note: It's also a good idea to set "private" to true when using this feature.
         */
        workspaces?:
            | string[]
            | {
                  /**
                   * Workspace package paths. Glob patterns are supported.
                   */
                  packages?: string[];
                  /**
                   * Packages to block from hoisting to the workspace root. Currently only supported in Yarn only.
                   */
                  nohoist?: string[];
                  [k: string]: unknown;
              };
        jspm?: {
            [k: string]: unknown;
        };
        /**
         * Any property starting with _ is valid.
         *
         * This interface was referenced by `JSONSchemaForNPMPackageJsonFiles2`'s JSON-Schema definition
         * via the `patternProperty` "^_".
         */
        [k: string]: any;
    }
    /**
     * A person who has been involved in creating or maintaining this package.
     */
    export type Person =
        | {
              name: string;
              url?: string;
              email?: string;
              [k: string]: unknown;
          }
        | string;
    export type PackageExportsEntry = PackageExportsEntryPath | PackageExportsEntryObject;
    /**
     * The module path that is resolved when this specifier is imported. Set to `null` to disallow importing this module.
     */
    export type PackageExportsEntryPath = string | null;
    /**
     * Used to allow fallbacks in case this environment doesn't support the preceding entries.
     */
    export type PackageExportsFallback = PackageExportsEntry[];
    /**
     * Run AFTER the package is published.
     */
    export type ScriptsPublishAfter = string;
    /**
     * Run AFTER the package is installed.
     */
    export type ScriptsInstallAfter = string;
    /**
     * Run BEFORE the package is uninstalled.
     */
    export type ScriptsUninstallBefore = string;
    /**
     * Run BEFORE bump the package version.
     */
    export type ScriptsVersionBefore = string;
    /**
     * Run by the 'npm test' command.
     */
    export type ScriptsTest = string;
    /**
     * Run by the 'npm stop' command.
     */
    export type ScriptsStop = string;
    /**
     * Run by the 'npm start' command.
     */
    export type ScriptsStart = string;
    /**
     * Run by the 'npm restart' command. Note: 'npm restart' will run the stop and start scripts if no restart script is provided.
     */
    export type ScriptsRestart = string;
    /**
     * Used to specify conditional exports, note that Conditional exports are unsupported in older environments, so it's recommended to use the fallback array option if support for those environments is a concern.
     */
    export interface PackageExportsEntryObject {
        /**
         * The module path that is resolved when this specifier is imported as a CommonJS module using the `require(...)` function.
         */
        require?: PackageExportsEntry | PackageExportsFallback;
        /**
         * The module path that is resolved when this specifier is imported as an ECMAScript module using an `import` declaration or the dynamic `import(...)` function.
         */
        import?: PackageExportsEntry | PackageExportsFallback;
        /**
         * The module path that is resolved when this environment is Node.js.
         */
        node?: PackageExportsEntry | PackageExportsFallback;
        /**
         * The module path that is resolved when no other export type matches.
         */
        default?: PackageExportsEntry | PackageExportsFallback;
        /**
         * The module path that is resolved when this environment matches the property name.
         *
         * This interface was referenced by `PackageExportsEntryObject`'s JSON-Schema definition
         * via the `patternProperty` "^(?![\.0-9]).".
         *
         * This interface was referenced by `undefined`'s JSON-Schema definition
         * via the `patternProperty` "^(?![\.0-9]).".
         */
        [k: string]: PackageExportsEntry | PackageExportsFallback | undefined;
    }
    /**
     * Dependencies are specified with a simple hash of package name to version range. The version range is a string which has one or more space-separated descriptors. Dependencies can also be identified with a tarball or git URL.
     */
    export interface Dependency {
        [k: string]: string;
    }
}
