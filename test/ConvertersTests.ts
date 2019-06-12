import { fromRpcHttp, getBindingDefinitions, getNormalizedBindingData, toRpcHttp, fromNullableString, fromRpcClaim, fromRpcClaimsIdentity } from '../src/Converters';
import { FunctionInfo } from '../src/FunctionInfo';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { AzureFunctionsRpcMessages as rpc , IRpcClaim, IRpcClaimsIdentity } from '../azure-functions-language-worker-protobuf/src/rpc';
import 'mocha';
import { Claim } from '../src/public/Interfaces';

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
        "Properties": {
            json: JSON.stringify({"Greetings": ["Hola", "Salut", "Konichiwa"], "SequenceNumber": [1, 2, 3]})
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
    expect(bindingData.sequenceNumberArray[0]).to.equal(1);
    expect(bindingData.sys.methodName).to.equal('test-js');
    expect(bindingData.sys.utcNow).to.equal('2018');
    expect(bindingData.sys.randGuid).to.equal('3212');
    // Verify that nested arrays are converted correctly
    let properties = bindingData.properties;
    expect(Array.isArray(properties.greetings)).to.be.true;
    expect(properties.greetings.length).to.equal(3);
    expect(properties.greetings[1]).to.equal("Salut");
    expect(Array.isArray(properties.sequenceNumber)).to.be.true;
    expect(properties.sequenceNumber.length).to.equal(3);
    expect(properties.sequenceNumber[0]).to.equal(1);
    // Verify accessing original keys is undefined
    expect(bindingData.Sys).to.be.undefined;
    expect(bindingData.sys.UtcNow).to.be.undefined;
  });

  it('catologues binding definitions', () => {
    let functionMetaData: rpc.IRpcFunctionMetadata = <rpc.IRpcFunctionMetadata> {
        name: "MyFunction",
        directory: ".",
        scriptFile: "index.js",
        bindings: {
            req: {
                type: "httpTrigger",
                direction: rpc.BindingInfo.Direction.in
            },
            res: {
                type: "http",
                direction: rpc.BindingInfo.Direction.out
            },
            firstQueueOutput: {
                type: "queue",
                direction: rpc.BindingInfo.Direction.out
            },
            noDirection: {
                type: "queue"
            }
        }
    };

    let functionInfo: FunctionInfo = new FunctionInfo(functionMetaData);
    
    var bindingDefinitions = getBindingDefinitions(functionInfo);
    // Verify conversion to camelCase
    expect(bindingDefinitions.length).to.equal(4);
    expect(bindingDefinitions[0].name).to.equal("req");
    expect(bindingDefinitions[0].direction).to.equal("in");
    expect(bindingDefinitions[0].type).to.equal("httpTrigger");
    expect(bindingDefinitions[1].name).to.equal("res");
    expect(bindingDefinitions[1].direction).to.equal("out");
    expect(bindingDefinitions[1].type).to.equal("http");
    expect(bindingDefinitions[2].name).to.equal("firstQueueOutput");
    expect(bindingDefinitions[2].direction).to.equal("out");
    expect(bindingDefinitions[2].type).to.equal("queue");
    expect(bindingDefinitions[3].name).to.equal("noDirection");
    expect(bindingDefinitions[3].direction).to.be.undefined;
    expect(bindingDefinitions[3].type).to.equal("queue");
  });

  it('copies all properties from gRPC HTTP object', () => {
    const bodyObj = {
        name: "Chaz",
        species: "Toucan",
        toesPerFoot: 4,
        isBird: true,
        despises: [ "train whistles", "the young" ]
    };
    const bodyStr = JSON.stringify(bodyObj);
    const bodyTypedData = { json: bodyStr };

    const method = "GET";
    const url = "http://localhost:7071";
    const headers = {
        "Content-Type": "application/json",
        "foo": "bar"
    };
    const params = { 
        "foo": "bar",
        "baz": "qux"
    };
    const query = { "name": "Test" };
    const rpcIdentities = [
        {
            claims: [
                {
                    value: "Admin",
                    type: "http://schemas.microsoft.com/2017/07/functions/claims/authlevel"
                },
                {
                    value: "master",
                    type: "http://schemas.microsoft.com/2017/07/functions/claims/keyid"
                }
            ],
            authenticationType: { value: "WebJobsAuthLevel" },
            nameClaimType: { value: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name" },
            roleClaimType: { value: "http://schemas.microsoft.com/ws/2008/06/identity/claims/role" }
        },        
        {
            claims: [
                {
                value: "Connor McMahon",
                type: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"
                },
                {
                value: "Connor McMahon",
                type: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn"
                },
                {
                value: "10241897674253170",
                type: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"
                }
            ],
            authenticationType: { value: "facebook" },
            nameClaimType: { value: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name" },
            roleClaimType: { value: "http://schemas.microsoft.com/ws/2008/06/identity/claims/role" }
        }
    ];

    const expectedIdentities = [
        {
            claims: [
                {
                    value: "Admin",
                    type: "http://schemas.microsoft.com/2017/07/functions/claims/authlevel"
                },
                {
                    value: "master",
                    type: "http://schemas.microsoft.com/2017/07/functions/claims/keyid"
                }
            ],
            authenticationType: "WebJobsAuthLevel",
            nameClaimType: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
            roleClaimType: "http://schemas.microsoft.com/ws/2008/06/identity/claims/role"
        },
        {   
            claims: [
                {
                    value: "Connor McMahon",
                    type: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"
                },
                {
                    value: "Connor McMahon",
                    type: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn"
                },
                {
                    value: "10241897674253170",
                    type: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"
                }
            ],
            authenticationType: "facebook",
            nameClaimType: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
            roleClaimType: "http://schemas.microsoft.com/ws/2008/06/identity/claims/role"
        }
    ];
    
    const rpcHttpObj: rpc.IRpcHttp = {
        method: method,
        url: url,
        body: bodyTypedData,
        headers: headers,
        params: params,
        query: query,
        rawBody: bodyTypedData,
        identities: rpcIdentities,
    };

    const httpContext = fromRpcHttp(rpcHttpObj);
    // verify all fields translated
    expect(httpContext.method).to.equal(method);
    expect(httpContext.url).to.equal(url);
    expect(httpContext.originalUrl).to.equal(url);
    expect(httpContext.headers).to.deep.equal(headers);
    expect(httpContext.query).to.deep.equal(query);
    expect(httpContext.params).to.deep.equal(params);
    expect(httpContext.body).to.deep.equal(bodyObj);
    expect(httpContext.rawBody).to.equal(bodyStr);
    expect(httpContext.user).to.deep.equal(expectedIdentities);
  });

  describe('fromNullableString()', () => {
    const nonexistentValues = [ undefined, null ];
    const testValues = [ "", "peaceSign" ];

    nonexistentValues.forEach(obj => it(`converts ${obj} to undefined`, () => {
        const result = fromNullableString(obj);
        expect(result).to.equal(undefined);
    }));

    nonexistentValues.forEach(obj => it(`converts nullableString with value ${obj} to undefined`, () => {
        const result = fromNullableString({ value: obj });
        expect(result).to.equal(undefined);
    }));

    testValues.forEach(testValue =>
        it(`converts nullableString with value ${testValue === "" ? "\"\"" : testValue} to ${testValue === "" ? "\"\"" : testValue}`, () => {
            const testObj = { value: testValue }
            const result = fromNullableString(testObj);
            expect(result).to.equal(testValue);
    }));
  });

  describe('fromRpcClaim()', () => {
    it("converts IRpcClaim with null values to Claim with empty strings", () => {
        const rpcClaim: IRpcClaim = {
            value: null,
            type: null,
        };
        const expectedClaim: Claim = {
            value: "",
            type: "",
        }

        const result = fromRpcClaim(rpcClaim);
        expect(result).to.deep.equal(expectedClaim);
    });

    it("converts IRpcClaim to Claim", () => {
        const rpcClaim: IRpcClaim = {
            value: "Poe",
            type: "name",
        };
        const expectedClaim: Claim = {
            value: "Poe",
            type: "name",
        }

        const result = fromRpcClaim(rpcClaim);
        expect(result).to.deep.equal(expectedClaim);
    });
  });

  describe('fromRpcClaimsIdentity', () => {
    it("converts IRpcClaimsIdentity to ClaimsIdentity", () => {
        const rpcIdentity: IRpcClaimsIdentity =
        {
            claims: [
                {
                    value: "Admin",
                    type: "http://schemas.microsoft.com/2017/07/functions/claims/authlevel"
                },
                {
                    value: "master",
                    type: "http://schemas.microsoft.com/2017/07/functions/claims/keyid"
                }
            ],
            authenticationType: { value: "WebJobsAuthLevel" },
            nameClaimType: { value: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name" },
            roleClaimType: { value: "http://schemas.microsoft.com/ws/2008/06/identity/claims/role" }
        };

        const expectedIdentity = 
        {
            claims: [
                {
                    value: "Admin",
                    type: "http://schemas.microsoft.com/2017/07/functions/claims/authlevel"
                },
                {
                    value: "master",
                    type: "http://schemas.microsoft.com/2017/07/functions/claims/keyid"
                }
            ],
            authenticationType: "WebJobsAuthLevel",
            nameClaimType: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
            roleClaimType: "http://schemas.microsoft.com/ws/2008/06/identity/claims/role"
        };

        const result = fromRpcClaimsIdentity(rpcIdentity);
        expect(result).to.deep.equal(expectedIdentity);
    });
  });
})