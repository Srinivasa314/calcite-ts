// @ts-ignore
const DenoCore = Deno.core as {
    ops: () => { [key: string]: number };
    setAsyncHandler(rid: number, handler: Function): void;
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
    return function (...args: ArrayBufferView[]) {
        DenoCore.dispatch(opId, ...args)
    }
}