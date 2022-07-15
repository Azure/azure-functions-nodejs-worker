// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { RpcBindingInfo, RpcFunctionMetadata, RpcInvocationRequest, RpcTypedData } from '@azure/functions-core';
import { expect } from 'chai';
import { fromString } from 'long';
import 'mocha';
import { getBindingDefinitions, getNormalizedBindingData } from '../../src/converters/BindingConverters';
import { fromTypedData } from '../../src/converters/RpcConverters';
import { toRpcHttp } from '../../src/converters/RpcHttpConverters';
import { FunctionInfo } from '../../src/FunctionInfo';

describe('Binding Converters', () => {
    it('normalizes binding trigger metadata for HTTP', () => {
        const mockRequest: RpcTypedData = toRpcHttp({ url: 'https://mock' });
        const triggerDataMock: { [k: string]: RpcTypedData } = {
            Headers: {
                json: JSON.stringify({ Connection: 'Keep-Alive' }),
            },
            Req: mockRequest,
            Sys: {
                json: JSON.stringify({ MethodName: 'test-js', UtcNow: '2018', RandGuid: '3212' }),
            },
            $request: {
                string: 'Https://mock/',
            },
            falsyZero: {
                string: '0',
            },
            falsyFalse: {
                string: 'false',
            },
            falsyNull: {
                string: 'null',
            },
            falsyEmptyString: {
                string: '',
            },
            falsyUndefined: {
                string: undefined,
            },
        };

        const request: RpcInvocationRequest = <RpcInvocationRequest>{
            triggerMetadata: triggerDataMock,
            invocationId: '12341',
        };

        const bindingData = getNormalizedBindingData(request);
        // Verify conversion to camelCase
        expect(bindingData.invocationId).to.equal('12341');
        expect(bindingData.headers.connection).to.equal('Keep-Alive');
        expect(bindingData.req.http.url).to.equal('https://mock');
        expect(bindingData.sys.methodName).to.equal('test-js');
        expect(bindingData.sys.utcNow).to.equal('2018');
        expect(bindingData.sys.randGuid).to.equal('3212');
        expect(bindingData.$request).to.equal('Https://mock/');
        expect(bindingData.falsyZero).to.equal(0);
        expect(bindingData.falsyFalse).to.equal(false);
        expect(bindingData.falsyNull).to.equal(null);
        expect(bindingData.falsyEmptyString.string).to.equal('');
        expect(bindingData.falsyUndefined.string).to.equal(undefined);
        // Verify accessing original keys is undefined
        expect(bindingData.Sys).to.be.undefined;
        expect(bindingData.sys.UtcNow).to.be.undefined;
    });

    it('normalizes binding trigger metadata containing arrays', () => {
        const triggerDataMock: { [k: string]: RpcTypedData } = {
            EnqueuedMessages: {
                json: JSON.stringify(['Hello 1', 'Hello 2']),
            },
            SequenceNumberArray: {
                json: JSON.stringify([1, 2]),
            },
            Properties: {
                json: JSON.stringify({ Greetings: ['Hola', 'Salut', 'Konichiwa'], SequenceNumber: [1, 2, 3] }),
            },
            Sys: {
                json: JSON.stringify({ MethodName: 'test-js', UtcNow: '2018', RandGuid: '3212' }),
            },
        };
        const request: RpcInvocationRequest = <RpcInvocationRequest>{
            triggerMetadata: triggerDataMock,
            invocationId: '12341',
        };

        const bindingData = getNormalizedBindingData(request);
        // Verify conversion to camelCase
        expect(bindingData.invocationId).to.equal('12341');
        expect(Array.isArray(bindingData.enqueuedMessages)).to.be.true;
        expect(bindingData.enqueuedMessages.length).to.equal(2);
        expect(bindingData.enqueuedMessages[1]).to.equal('Hello 2');
        expect(Array.isArray(bindingData.sequenceNumberArray)).to.be.true;
        expect(bindingData.sequenceNumberArray.length).to.equal(2);
        expect(bindingData.sequenceNumberArray[0]).to.equal(1);
        expect(bindingData.sys.methodName).to.equal('test-js');
        expect(bindingData.sys.utcNow).to.equal('2018');
        expect(bindingData.sys.randGuid).to.equal('3212');
        // Verify that nested arrays are converted correctly
        const properties = bindingData.properties;
        expect(Array.isArray(properties.greetings)).to.be.true;
        expect(properties.greetings.length).to.equal(3);
        expect(properties.greetings[1]).to.equal('Salut');
        expect(Array.isArray(properties.sequenceNumber)).to.be.true;
        expect(properties.sequenceNumber.length).to.equal(3);
        expect(properties.sequenceNumber[0]).to.equal(1);
        // Verify accessing original keys is undefined
        expect(bindingData.Sys).to.be.undefined;
        expect(bindingData.sys.UtcNow).to.be.undefined;
    });

    it('catologues binding definitions', () => {
        const functionMetaData: RpcFunctionMetadata = <RpcFunctionMetadata>{
            name: 'MyFunction',
            directory: '.',
            scriptFile: 'index.js',
            bindings: {
                req: {
                    type: 'httpTrigger',
                    direction: RpcBindingInfo.Direction.in,
                },
                res: {
                    type: 'http',
                    direction: RpcBindingInfo.Direction.out,
                },
                firstQueueOutput: {
                    type: 'queue',
                    direction: RpcBindingInfo.Direction.out,
                },
                noDirection: {
                    type: 'queue',
                },
            },
        };

        const functionInfo: FunctionInfo = new FunctionInfo(functionMetaData);

        const bindingDefinitions = getBindingDefinitions(functionInfo);
        // Verify conversion to camelCase
        expect(bindingDefinitions.length).to.equal(4);
        expect(bindingDefinitions[0].name).to.equal('req');
        expect(bindingDefinitions[0].direction).to.equal('in');
        expect(bindingDefinitions[0].type).to.equal('httpTrigger');
        expect(bindingDefinitions[1].name).to.equal('res');
        expect(bindingDefinitions[1].direction).to.equal('out');
        expect(bindingDefinitions[1].type).to.equal('http');
        expect(bindingDefinitions[2].name).to.equal('firstQueueOutput');
        expect(bindingDefinitions[2].direction).to.equal('out');
        expect(bindingDefinitions[2].type).to.equal('queue');
        expect(bindingDefinitions[3].name).to.equal('noDirection');
        expect(bindingDefinitions[3].direction).to.be.undefined;
        expect(bindingDefinitions[3].type).to.equal('queue');
    });

    it('deserializes string data with fromTypedData', () => {
        const data = fromTypedData({ string: 'foo' });
        expect(data).to.equal('foo');
    });

    it('deserializes json data with fromTypedData', () => {
        const data = fromTypedData({ json: '{ "foo": "bar" }' });
        expect(data && data['foo']).to.equal('bar');
    });

    it('deserializes byte data with fromTypedData', () => {
        const buffer = Buffer.from('hello');
        const data = fromTypedData({ bytes: buffer });
        expect(data && data['buffer']).to.equal(buffer.buffer);
    });

    it('deserializes collectionBytes data with fromTypedData', () => {
        const fooBuffer = Buffer.from('foo');
        const barBuffer = Buffer.from('bar');
        const data = fromTypedData({ collectionBytes: { bytes: [fooBuffer, barBuffer] } });
        expect(data && data[0] && data[0]['buffer']).to.equal(fooBuffer.buffer);
        expect(data && data[1] && data[1]['buffer']).to.equal(barBuffer.buffer);
    });

    it('deserializes collectionString data with fromTypedData', () => {
        const data = fromTypedData({ collectionString: { string: ['foo', 'bar'] } });
        expect(data && data[0]).to.equal('foo');
        expect(data && data[1]).to.equal('bar');
    });

    it('deserializes collectionDouble data with fromTypedData', () => {
        const data = fromTypedData({ collectionDouble: { double: [1.1, 2.2] } });
        expect(data && data[0]).to.equal(1.1);
        expect(data && data[1]).to.equal(2.2);
    });

    it('deserializes collectionSint64 data with fromTypedData', () => {
        const data = fromTypedData({ collectionSint64: { sint64: [123, fromString('9007199254740992')] } });
        expect(data && data[0]).to.equal(123);
        expect(data && data[1]).to.equal('9007199254740992');
    });
});
