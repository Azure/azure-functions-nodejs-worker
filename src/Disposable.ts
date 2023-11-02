// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

/**
 * Based off of VS Code
 * https://github.com/microsoft/vscode/blob/7bed4ce3e9f5059b5fc638c348f064edabcce5d2/src/vs/workbench/api/common/extHostTypes.ts#L65
 */
export class Disposable {
    static from(...inDisposables: { dispose(): any }[]): Disposable {
        let disposables: ReadonlyArray<{ dispose(): any }> | undefined = inDisposables;
        return new Disposable(function () {
            if (disposables) {
                for (const disposable of disposables) {
                    if (disposable && typeof disposable.dispose === 'function') {
                        disposable.dispose();
                    }
                }
                disposables = undefined;
            }
        });
    }

    #callOnDispose?: () => any;

    constructor(callOnDispose: () => any) {
        this.#callOnDispose = callOnDispose;
    }

    dispose(): any {
        if (typeof this.#callOnDispose === 'function') {
            this.#callOnDispose();
            this.#callOnDispose = undefined;
        }
    }
}
