
const transformData = (obj: any, cache = new Map(), idGen = (function* () {
    let id = 0;
    while (true) {
        yield id++;
    }
})()) => {
    if (cache.has(obj)) return cache.get(obj);
    switch (typeof obj) {
        case 'object': {
            if (obj._IS_TRANSFORMED_) return obj;
            const newObj = Array.isArray(obj) ? new Array(obj.length) : {};
            for (const key in obj) {
                // @ts-ignore
                newObj[key] = transformData(obj[key], cache, idGen);
            }
            cache.set(obj, newObj);
            return newObj;
        }
        case 'function': {
            const e = { id: idGen.next().value, type: 'fn_str', code: obj.toString(), _IS_TRANSFORMED_: true };
            cache.set(obj, e);
            break;
        }

        default:
            return obj;
    }
    return cache.get(obj);
}

const createRequset = (event: RuntimeEvent, name: string, args: any, transfer: Transferable[] = [], timeout = 5000) => {
    let reqid = Math.random().toString(36);
    return new Promise((resolve, reject) => {
        while (true) {
            if (!event.promises.has(reqid)) break;
            reqid = Math.random().toString(36);
        }
        event.promises.set(reqid, { resolve, reject });
        event.thread.postMessage({
            __IS_TYPED_WORKER__: true,
            isRequest: true,
            reqid,
            name,
            args: transformData(args, new Map(transfer.map(v => [v, v]))),
        }, {
            transfer
        })
        setTimeout(() => {
            reject('Request timed out');
        }, timeout)
    }).finally(() => {
        event.promises.delete(reqid);
    })
}

const restoreMessage = (event: RuntimeEvent, root: MessageEvent, obj = root.data.data, cache = new Map()) => {
    return new Proxy(obj, {
        get(target, prop, receiver) {
            const value = Reflect.get(target, prop, receiver);
            if (typeof value === 'object' && value !== null) {
                if (value._IS_TRANSFORMED_) {
                    switch (value.type) {
                        case 'fn': {
                            const fn = function (...args: any[]) {
                                // @ts-ignore
                                return createRequset(event, value.id as string, args, fn.transfer, fn.timeout);
                            }
                            // @ts-ignore
                            fn.transfer = [];
                            fn.timeout = 5000;
                            return fn;
                        }
                        case 'fn_str': {
                            cache.set(value.id, new Function('return ' + value.code)());
                            break
                        }
                    }
                    return cache.get(value.id);
                }
                return restoreMessage(event, root, value, cache);
            }
            return value;
        },
        set(target, prop, value, receiver) {
            return Reflect.set(target, prop, value, receiver);
        }
    })
}


type CommRequest = {
    __IS_TYPED_WORKER__: true;
    isRequest: true;
    reqid: string;
    name: string;
    args: unknown[];
};

/**
 * Data sent from worker to main thread.
 */
type CommResult = {
    __IS_TYPED_WORKER__: true;
    isRequest: false;
    reqid: string;
    isReject?: boolean;
    data: unknown;
};

type RuntimeEvent = {
    thread: Worker | Window,
    handlers: Map<string, Function>
    promises: Map<string, { resolve: Function; reject: Function; }>
    cg: WeakMap<Function, number>
}

const TEMP_FUNCTION_CG = 30 * 1000;
const TEMP_NAME_PREFIX = 'temp_fn_';


const createRuntime = (thread: Worker | Window) => {
    return {
        thread,
        handlers: new Map(),
        promises: new Map(),
        cg: new WeakMap(),
    }
}

const messageHandler = (event: RuntimeEvent) => {
    const { thread, handlers, promises, cg } = event;
    let cgCdlieId = 0;
    return async (m: MessageEvent) => {
        // console.log('worker message', m);
        if (!m.data.__IS_TYPED_WORKER__)
            return;
        const data = m.data as CommRequest | CommResult;
        try {
            if (data.isRequest) {
                const fn = handlers.get(data.name);
                if (fn) {
                    cg.has(fn) && cg.set(fn, Date.now());
                    try {
                        const result = await fn(...restoreMessage(event, m, data.args));
                        thread.postMessage({
                            __IS_TYPED_WORKER__: true,
                            isRequest: false,
                            reqid: data.reqid,
                            data: transformData(result),
                        })

                    } catch (e) {
                        thread.postMessage({
                            __IS_TYPED_WORKER__: true,
                            isRequest: false,
                            reqid: data.reqid,
                            isReject: true,
                            data: transformData(e),
                        });
                    }
                } else {
                    thread.postMessage({
                        __IS_TYPED_WORKER__: true,
                        isRequest: false,
                        reqid: data.reqid,
                        isReject: true,
                        data: 'Function not found'
                    });
                }
            } else {
                const promise = promises.get(data.reqid);
                // console.log('promise', promise, promises);
                if (promise) {
                    const res = data.data;
                    const unpacked = (typeof res === 'object' && res !== null) ? restoreMessage(event, m) : res;

                    data.isReject ?
                        promise.reject(unpacked)
                        :
                        promise.resolve(unpacked);

                }
            }
        } catch (e) {
            console.error(e);
            promises.forEach((p) => p.reject(e));
        }
        cgCdlieId && clearTimeout(cgCdlieId);
        // 节流遍历
        cgCdlieId = setTimeout(() => {
            // 遍历获得全部
            for (const [name, fn] of handlers) {
                if (!name.startsWith(TEMP_NAME_PREFIX)) continue;
                const now = Date.now();
                if (!cg.has(fn)) {
                    cg.set(fn, now);
                    continue;
                }
                if (now - cg.get(fn)! > TEMP_FUNCTION_CG) {
                    handlers.delete(name);
                }
            }
        }, TEMP_FUNCTION_CG);
    }
}


export const defineReceive = <T extends Record<string, (...args: any[]) => any>>(e: T) => {
    const event = createRuntime(self);
    Object.entries(e).forEach(([name, fn]) => {
        event.handlers.set(name, fn);
    });
    self.onmessage = messageHandler(event);
    return null as unknown as () => WorkerEvent<T>;
}

export type WorkerCallBack<T> = (T extends (...args: any[]) => any ? (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>> : never) & {
    transfer: Transferable[];
    timeout: number;
};


type WorkerEvent<T extends Record<string, (...args: any[]) => any>> = {
    worker: Worker;
    event: RuntimeEvent
    cb: <T extends (...args: any[]) => any>(e: T, name?: string) => any;
    methods: { [K in keyof T]: WorkerCallBack<T[K]>; };
}

export const useWorker = <T extends Record<string, (...args: any[]) => any>>(worker: Worker) => {
    const event = createRuntime(worker);
    worker.addEventListener('error', (e) => {
        event.handlers.clear();
        event.promises.forEach((p) => p.reject('connection error'));
    });
    worker.addEventListener('message', messageHandler(event));
    return <WorkerEvent<T>>{
        worker,
        event,
        cb: (e: T, name) => {
            let id: string;
            if (name) {
                id = name;
            } else {
                id = TEMP_NAME_PREFIX + Math.random().toString(36).slice(2);
                while (event.handlers.has(id)) {
                    id = TEMP_NAME_PREFIX + Math.random().toString(36).slice(2);
                }
            }
            event.handlers.set(id, e);
            return {
                _IS_TRANSFORMED_: true,
                type: 'fn',
                id: TEMP_NAME_PREFIX + Math.random().toString(36).slice(2),
            }
        },
        methods: new Proxy({}, {
            get(_target, name) {

                const fn = function (...args: any[]) {
                    // @ts-ignore
                    return createRequset(event, name as string, args, fn.transfer, fn.timeout);
                }
                // @ts-ignore
                fn.transfer = [];
                fn.timeout = 5000;
                return fn;
            }
        }) as { [K in keyof T]: WorkerCallBack<T[K]> }
    }
}