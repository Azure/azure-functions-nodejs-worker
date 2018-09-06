import { getNormalizedBindingData, toRpcHttp } from '../src/Converters';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import 'mocha';

describe('Converters', () => {
  it('normalizes binding trigger metadata for HTTP', () => {
    var mockRequest: rpc.ITypedData = toRpcHttp({ url: "https://mock"});
    var triggerDataMock: { [k: string]: rpc.ITypedData } = {
        "Headers": {
            json: JSON.stringify({Connection: 'Keep-Alive'})
        },
        "Req": mockRequest,
        "Sys": {
            json: JSON.stringify({MethodName: 'test-js', UtcNow: '2018', RandGuid: '3212'})
        },
        "$request": {
            string: "Https://mock/"
        }
    };
    var request: rpc.IInvocationRequest = <rpc.IInvocationRequest> {
        triggerMetadata: triggerDataMock,
        invocationId: "12341"
    }
    
    var bindingData = getNormalizedBindingData(request);
    // Verify conversion to camelCase
    expect(bindingData.invocationId).to.equal('12341');
    expect(bindingData.headers.connection).to.equal('Keep-Alive');
    expect(bindingData.req.http.url).to.equal("https://mock");
    expect(bindingData.sys.methodName).to.equal('test-js');
    expect(bindingData.sys.utcNow).to.equal('2018');
    expect(bindingData.sys.randGuid).to.equal('3212');
    expect(bindingData.$request).to.equal('Https://mock/');
    // Verify accessing original keys is undefined
    expect(bindingData.Sys).to.be.undefined;
    expect(bindingData.sys.UtcNow).to.be.undefined;
  });

  it('normalizes binding trigger metadata containing arrays', () => {
    var triggerDataMock: { [k: string]: rpc.ITypedData } = {
        "EnqueuedMessages": {
            json: JSON.stringify(["Hello 1", "Hello 2"])
        },
        "SequenceNumberArray": {
            json: JSON.stringify([1, 2])
        },
        "Sys": {
            json: JSON.stringify({MethodName: 'test-js', UtcNow: '2018', RandGuid: '3212'})
        }
    };
    var request: rpc.IInvocationRequest = <rpc.IInvocationRequest> {
        triggerMetadata: triggerDataMock,
        invocationId: "12341"
    }
    
    var bindingData = getNormalizedBindingData(request);
    // Verify conversion to camelCase
    expect(bindingData.invocationId).to.equal('12341');
    expect(Array.isArray(bindingData.enqueuedMessages)).to.be.true;
    expect(bindingData.enqueuedMessages.length).to.equal(2);
    expect(bindingData.enqueuedMessages[1]).to.equal("Hello 2");
    expect(Array.isArray(bindingData.sequenceNumberArray)).to.be.true;
    expect(bindingData.sequenceNumberArray.length).to.equal(2);
    expect(bindingData.sequenceNumberArray[1]).to.equal(2);
    expect(bindingData.sys.methodName).to.equal('test-js');
    expect(bindingData.sys.utcNow).to.equal('2018');
    expect(bindingData.sys.randGuid).to.equal('3212');
    // Verify accessing original keys is undefined
    expect(bindingData.Sys).to.be.undefined;
    expect(bindingData.sys.UtcNow).to.be.undefined;
  });
})