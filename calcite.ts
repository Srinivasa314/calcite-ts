import { encode, decode } from "https://deno.land/x/msgpack/mod.ts";

// @ts-ignore
const DenoCore = Deno.core as {
  ops: () => { [key: string]: number };
  setAsyncHandler(rid: number, handler: (_: Uint8Array) => void): void;
  dispatch(
    rid: number,
    ...buf: ArrayBufferView[]
  ): Uint8Array | undefined;
};

let filenameSuffix = ".so";
let filenamePrefix = "lib";

if (Deno.build.os === "windows") {
  filenameSuffix = ".dll";
  filenamePrefix = "";
}

if (Deno.build.os === "darwin") {
  filenameSuffix = ".dylib";
}

import { prepare } from "https://deno.land/x/plugin_prepare@v0.7.0/mod.ts";

export async function loadPlugin(name: string, url: string) {
  return await prepare({
    name: name,
    urls: {
      darwin: `${url}/lib${name}.dylib`,
      windows: `${url}/${name}.dll`,
      linux: `${url}/lib${name}.so`,
    },
  });
}

export function importFromPlugin(
  name: string,
  options: { returnRawBuffer: boolean } = { returnRawBuffer: false },
) {
  let opId = DenoCore.ops()[name];
  return function (...args: any[]) {
    let res = DenoCore.dispatch(
      opId,
      ...(args.map((arg) => arg != null && arg.buffer ? arg : encode(arg))),
    )!;
    return options.returnRawBuffer ? res : decode(res);
  };
}

interface AsyncResponse {
  commandId: number;
  result: { 0?: any; 1?: any };
}

export function importAsyncFromPlugin(name: string) {
  let opId = DenoCore.ops()[name];
  let pendingCommands: [Function, Function][] = [];

  DenoCore.setAsyncHandler(opId, (bytes) => {
    let response = decode(bytes) as AsyncResponse;
    if (typeof response.result["0"] != "undefined") {
      pendingCommands[response.commandId][0](response.result["0"]);
    } else {
      pendingCommands[response.commandId][1](response.result["1"]);
    }
  });

  return function (...args: any[]) {
    return new Promise((resolve, reject) => {
      DenoCore.dispatch(
        opId,
        encode(pendingCommands.length),
        ...args.map((arg) => encode(arg)),
      );
      pendingCommands.push([resolve, reject]);
    });
  };
}
