// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

/**
 * Based off of VS Code
 * https://github.com/microsoft/vscode/blob/a64e8e5673a44e5b9c2d493666bde684bd5a135c/src/vs/workbench/api/common/extHostTypes.ts#L32
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
        if (this.#callOnDispose instanceof Function) {
            this.#callOnDispose();
            this.#callOnDispose = undefined;
        }
    }
}
