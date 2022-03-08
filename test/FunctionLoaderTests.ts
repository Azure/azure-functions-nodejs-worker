// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import 'mocha';
import * as mock from 'mock-require';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import { FunctionLoader } from '../src/FunctionLoader';
const expect = chai.expect;
chai.use(chaiAsPromised);

describe('FunctionLoader', () => {
    let loader: FunctionLoader;
    let context, logs;

    beforeEach(() => {
        loader = new FunctionLoader();
        logs = [];
        context = {
            _inputs: [],
            bindings: {},
            log: (message) => logs.push(message),
            bind: (val, cb) => {
                cb && cb(val);
            },
        };
    });

    it('throws unable to determine function entry point', async () => {
        mock('test', {});
        await expect(
            loader.load(
                'functionId',
                <rpc.IRpcFunctionMetadata>{
                    scriptFile: 'test',
                },
                {}
            )
        ).to.be.rejectedWith(
            "Unable to determine function entry point. If multiple functions are exported, you must indicate the entry point, either by naming it 'run' or 'index', or by naming it explicitly via the 'entryPoint' metadata property."
        );
    });

    it('does not load proxy function', async () => {
        mock('test', {});
        await loader.load(
            'functionId',
            <rpc.IRpcFunctionMetadata>{
                isProxy: true,
            },
            {}
        );

        expect(() => {
            loader.getFunc('functionId');
        }).to.throw("Function code for 'functionId' is not loaded and cannot be invoked.");
    });

    it('throws unable to determine function entry point with entryPoint name', async () => {
        mock('test', { test: {} });
        const entryPoint = 'wrongEntryPoint';
        await expect(
            loader.load(
                'functionId',
                <rpc.IRpcFunctionMetadata>{
                    scriptFile: 'test',
                    entryPoint: entryPoint,
                },
                {}
            )
        ).to.be.rejectedWith(
            `Unable to determine function entry point: ${entryPoint}. If multiple functions are exported, you must indicate the entry point, either by naming it 'run' or 'index', or by naming it explicitly via the 'entryPoint' metadata property.`
        );
    });

    it('throws the resolved entry point is not a function', async () => {
        mock('test', { test: {} });
        const entryPoint = 'test';
        await expect(
            loader.load(
                'functionId',
                <rpc.IRpcFunctionMetadata>{
                    scriptFile: 'test',
                    entryPoint: entryPoint,
                },
                {}
            )
        ).to.be.rejectedWith(
            'The resolved entry point is not a function and cannot be invoked by the functions runtime. Make sure the function has been correctly exported.'
        );
    });

    it("allows use of 'this' in loaded user function", async () => {
        const FuncObject = /** @class */ (function () {
            function FuncObject(this: any) {
                this.prop = true;
            }
            FuncObject.prototype.index = function (ctx) {
                ctx.bindings.prop = this.test();
                ctx.done();
            };
            FuncObject.prototype.test = function () {
                return this.prop;
            };
            return FuncObject;
        })();

        mock('test', new FuncObject());

        await loader.load(
            'functionId',
            <rpc.IRpcFunctionMetadata>{
                scriptFile: 'test',
                entryPoint: 'test',
            },
            {}
        );

        const userFunction = loader.getFunc('functionId');

        userFunction(context, (results) => {
            expect(results).to.eql({ prop: true });
        });
    });

    it('allows to return a promise from async user function', async () => {
        mock('test', { test: async () => {} });

        await loader.load(
            'functionId',
            <rpc.IRpcFunctionMetadata>{
                scriptFile: 'test',
                entryPoint: 'test',
            },
            {}
        );

        const userFunction = loader.getFunc('functionId');
        const result = userFunction();

        expect(result).to.be.not.an('undefined');
        expect(result.then).to.be.a('function');
    });

    it('respects .cjs extension', () => {
        const result = loader.isUsingMjs('test.cjs', {
            type: 'module',
        });
        expect(result).to.be.false;
    });

    it('respects .mjs extension', () => {
        const result = loader.isUsingMjs('test.mjs', {
            type: 'commonjs',
        });
        expect(result).to.be.true;
    });

    it('respects module package.json module type', () => {
        const result = loader.isUsingMjs('test.js', {
            type: 'module',
        });
        expect(result).to.be.true;
    });

    it('defaults to using commonjs', () => {
        expect(loader.isUsingMjs('test.js', {})).to.be.false;
        expect(
            loader.isUsingMjs('test.js', {
                type: 'commonjs',
            })
        ).to.be.false;
    });

    afterEach(() => {
        mock.stopAll();
    });
});
