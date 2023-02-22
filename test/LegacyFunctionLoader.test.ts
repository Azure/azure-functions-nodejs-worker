// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import 'mocha';
import * as mock from 'mock-require';
import * as sinon from 'sinon';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import { LegacyFunctionLoader } from '../src/LegacyFunctionLoader';
import { nonNullValue } from '../src/utils/nonNull';
import { WorkerChannel } from '../src/WorkerChannel';
const expect = chai.expect;
chai.use(chaiAsPromised);

describe('LegacyFunctionLoader', () => {
    let loader: LegacyFunctionLoader;
    let context, logs;
    const channel: WorkerChannel = <WorkerChannel>(<any>sinon.createStubInstance(WorkerChannel));

    beforeEach(() => {
        loader = new LegacyFunctionLoader();
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
                channel,
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
            channel,
            'functionId',
            <rpc.IRpcFunctionMetadata>{
                isProxy: true,
            },
            {}
        );

        expect(loader.getFunction('functionId')).to.be.undefined;
    });

    it('throws unable to determine function entry point with entryPoint name', async () => {
        mock('test', { test: {} });
        const entryPoint = 'wrongEntryPoint';
        await expect(
            loader.load(
                channel,
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
                channel,
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
                // eslint-disable-next-line deprecation/deprecation
                ctx.done();
            };
            FuncObject.prototype.test = function () {
                return this.prop;
            };
            return FuncObject;
        })();

        mock('test', new FuncObject());

        await loader.load(
            channel,
            'functionId',
            <rpc.IRpcFunctionMetadata>{
                scriptFile: 'test',
                entryPoint: 'test',
            },
            {}
        );

        const userFunction = nonNullValue(loader.getFunction('functionId'));
        userFunction.callback(context, (results) => {
            expect(results).to.eql({ prop: true });
        });
    });

    it('allows to return a promise from async user function', async () => {
        mock('test', { test: async () => {} });

        await loader.load(
            channel,
            'functionId',
            <rpc.IRpcFunctionMetadata>{
                scriptFile: 'test',
                entryPoint: 'test',
            },
            {}
        );

        const userFunction = nonNullValue(loader.getFunction('functionId'));
        const result = userFunction.callback({});

        expect(result).to.be.not.an('undefined');
        expect((<any>result).then).to.be.a('function');
    });

    it("function returned is a clone so that it can't affect other executions", async () => {
        mock('test', { test: async () => {} });

        await loader.load(
            channel,
            'functionId',
            <rpc.IRpcFunctionMetadata>{
                scriptFile: 'test',
                entryPoint: 'test',
            },
            {}
        );

        const userFunction = nonNullValue(loader.getFunction('functionId')).callback;
        Object.assign(userFunction, { hello: 'world' });

        const userFunction2 = nonNullValue(loader.getFunction('functionId')).callback;

        expect(userFunction).to.not.equal(userFunction2);
        expect(userFunction['hello']).to.equal('world');
        expect(userFunction2['hello']).to.be.undefined;
    });

    afterEach(() => {
        mock.stopAll();
    });
});
