import { FunctionRpc as rpc } from '../protos/rpc';
import { toTypedData, toRpcHttp } from './Converters';

export class FunctionInfo {
  public name: string;
  public directory: string;
  public bindings: {
    [key: string]: rpc.BindingInfo$Properties
  };
  public outputBindings: {
    [key: string]: rpc.BindingInfo$Properties & { converter: (any) => rpc.TypedData$Properties }
  };
  public httpOutputName: string;

  constructor(metadata: rpc.RpcFunctionMetadata$Properties) {
    this.name = <string>metadata.name;
    this.directory = <string>metadata.directory;
    this.outputBindings = {};
    if (metadata.bindings) {
      let bindings = this.bindings = metadata.bindings;

      // determine output bindings & assign rpc converter (http has quirks)
      Object.keys(bindings)
        .filter(name => bindings[name].direction !== rpc.BindingInfo.Direction.in)
        .forEach(name => {
          if (bindings[name].type === 'http') {
            this.httpOutputName = name;
            this.outputBindings[name] = Object.assign(bindings[name], { converter: toRpcHttp });
          } else {
            this.outputBindings[name] = Object.assign(bindings[name], { converter: toTypedData });
          }
        });
    }
  }
}
