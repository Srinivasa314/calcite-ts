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
            linux: `${url}/lib${name}.so`
        }
    })
}

export function importFromPlugin(name: string) {
    let opId = DenoCore.ops()[name]
    return function (...args: any[]) {
        return decode(DenoCore.dispatch(opId, ...(args.map(arg => arg.buffer ? arg : encode(arg))))!)
    }
}

interface AsyncResponse {
    commandId: number,
    result?: any,
    error?: any
}

export function importAsyncFromPlugin(name: string) {
    let opId = DenoCore.ops()[name]
    let pendingCommands: [Function, Function][] = [];
    DenoCore.setAsyncHandler(opId, (bytes) => {
        let response = decode(bytes) as AsyncResponse;
        if (typeof response.result != "undefined") {
            pendingCommands[response.commandId][0](response.result)
        }
        else {
            pendingCommands[response.commandId][1](response.error)
        }
    })
    return function (...args: any[]) {
        return new Promise((resolve, reject) => {
            DenoCore.dispatch(opId, encode(pendingCommands.length), ...args.map(arg => encode(arg)))
            pendingCommands.push([resolve, reject])
        })
    }
}
