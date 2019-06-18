import { FunctionInfo } from '../src/FunctionInfo';
import { Cookie } from "../types/public/Interfaces";
import { expect } from 'chai';
import * as sinon from 'sinon';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import 'mocha';

describe('FunctionInfo', () => {
  /** NullableBool */ 
  it('gets $return output binding converter for http', () => {
    let metadata: rpc.IRpcFunctionMetadata = {
        bindings: {
            req: {
                type: "http",
                direction: 0,
                dataType: 1
            },
            $return: {
                type: "http",
                direction: 1,
                dataType: 1
            }
        }
    };
    
    let funcInfo = new FunctionInfo(metadata);
    console.log(funcInfo);
    expect(funcInfo.getReturnBinding().converter.name).to.equal("toRpcHttp");
  });

  it('gets $return output binding converter for TypedData', () => {
    let metadata: rpc.IRpcFunctionMetadata = {
        bindings: {
            input: {
                type: "queue",
                direction: 0,
                dataType: 1
            },
            $return: {
                type: "queue",
                direction: 1,
                dataType: 1
            }
        }
    };
    
    let funcInfo = new FunctionInfo(metadata);
    console.log(funcInfo);
    expect(funcInfo.getReturnBinding().converter.name).to.equal("toTypedData");
  });
})
