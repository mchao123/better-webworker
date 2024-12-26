interface TransformedObject {
    _IS_TRANSFORMED_: true;
    type: 'fn' | 'fn_str';
    id: string | number;
    code?: string;
}

function isTransformedObject(obj: any): obj is TransformedObject {
    return obj && obj._IS_TRANSFORMED_ === true;
}

const transformData = (obj: any, cache = new Map(), idGen = (function* () {
    let id = 0;
    while (true) {
        yield id++;
    }
})()) => {
    if (cache.has(obj)) return cache.get(obj);

    if (typeof obj !== 'object' && typeof obj !== 'function') {
        return obj;
    }

    if (obj === null) return obj;

    if (isTransformedObject(obj)) return obj;

    if (typeof obj === 'function') {
        const transformed = {
            id: idGen.next().value,
            type: 'fn_str' as const,
            code: obj.toString(),
            _IS_TRANSFORMED_: true
        };
        cache.set(obj, transformed);
        return transformed;
    }

    const newObj = Array.isArray(obj) ? new Array(obj.length) : {};
    cache.set(obj, newObj); // Set cache early to handle circular references

    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            // @ts-ignore
            newObj[key] = transformData(obj[key], cache, idGen);
        }
    }

    return newObj;
}

const createRequest = (event: RuntimeEvent, name: string, args: any, transfer: Transferable[] = [], timeout = 5000) => {
    const reqid = generateUniqueId(event);

    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            event.promises.delete(reqid);
            reject(new Error('Request timed out'));
        }, timeout);

        event.promises.set(reqid, {
            resolve: (value: any) => {
                clearTimeout(timeoutId);
                resolve(value);
            },
            reject: (error: any) => {
                clearTimeout(timeoutId);
                reject(error);
            }
        });

        const transferMap = new Map(transfer.map(v => [v, v]));
        const transformedArgs = transformData(args, transferMap);

        event.thread.postMessage({
            __IS_TYPED_WORKER__: true,
            isRequest: true,
            reqid,
            name,
            args: transformedArgs,
        }, { transfer });
    }).finally(() => {
        event.promises.delete(reqid);
    });
};

const generateUniqueId = (event: RuntimeEvent): string => {
    let reqid: string;
    do {
        reqid = Math.random().toString(36).slice(2);
    } while (event.promises.has(reqid));
    return reqid;
};

const restoreMessage = (event: RuntimeEvent, root: MessageEvent, obj = root.data.data, cache = new Map()) => {
    if (typeof obj !== 'object' || obj === null) {
        return obj;
    }

    return new Proxy(obj, {
        get(target, prop, receiver) {
            const value = Reflect.get(target, prop, receiver);

            if (typeof value !== 'object' || value === null) {
                return value;
            }

            if (isTransformedObject(value)) {
                switch (value.type) {
                    case 'fn': {
                        if (cache.has(value.id)) {
                            return cache.get(value.id);
                        }
                        const fn = function (...args: any[]) {
                            // @ts-ignore
                            return createRequest(event, value.id as string, args, fn.transfer, fn.timeout);
                        };
                        // @ts-ignore
                        fn.transfer = [];
                        fn.timeout = 5000;
                        cache.set(value.id, fn);
                        return fn;
                    }
                    case 'fn_str': {
                        if (!cache.has(value.id)) {
                            cache.set(value.id, new Function('return ' + value.code)());
                        }
                        return cache.get(value.id);
                    }
                }
            }

            return restoreMessage(event, root, value, cache);
        }
    });
}

type CommRequest = {
    __IS_TYPED_WORKER__: true;
    isRequest: true;
    reqid: string;
    name: string;
    args: unknown[];
};

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
export const TEMP_NAME_PREFIX = 'temp_fn_';

const createRuntime = (thread: Worker | Window): RuntimeEvent => ({
    thread,
    handlers: new Map(),
    promises: new Map(),
    cg: new WeakMap(),
});

const messageHandler = (event: RuntimeEvent) => {
    const { thread, handlers, promises, cg } = event;
    let cgCleanupId = 0;

    const cleanupTempHandlers = () => {
        const now = Date.now();
        for (const [name, fn] of handlers) {
            if (!name.startsWith(TEMP_NAME_PREFIX)) continue;

            if (!cg.has(fn)) {
                cg.set(fn, now);
                continue;
            }

            if (now - cg.get(fn)! > TEMP_FUNCTION_CG) {
                handlers.delete(name);
                cg.delete(fn);
            }
        }
    };

    return async (m: MessageEvent<CommRequest | CommResult>) => {
        const data = m.data;
        if (!data?.__IS_TYPED_WORKER__) return;

        try {
            if (data.isRequest) {
                const fn = handlers.get(data.name);
                if (!fn) {
                    throw new Error(`Function "${data.name}" not found`);
                }

                cg.has(fn) && cg.set(fn, Date.now());
                const args = restoreMessage(event, m, data.args);
                const result = await fn(...args);

                thread.postMessage({
                    __IS_TYPED_WORKER__: true,
                    isRequest: false,
                    reqid: data.reqid,
                    data: transformData(result),
                });
            } else {
                const promise = promises.get(data.reqid);
                if (promise) {
                    const res = data.data;
                    const unpacked = (typeof res === 'object' && res !== null)
                        ? restoreMessage(event, m)
                        : res;
                    data.isReject ? promise.reject(unpacked) : promise.resolve(unpacked);
                }
            }
        } catch (error) {
            console.error('Worker message handling error:', error);

            if (data.isRequest) {
                thread.postMessage({
                    __IS_TYPED_WORKER__: true,
                    isRequest: false,
                    reqid: data.reqid,
                    isReject: true,
                    data: transformData(error instanceof Error ? error.message : String(error)),
                });
            } else {
                promises.get(data.reqid)?.reject(error);
            }
        }

        cgCleanupId && clearTimeout(cgCleanupId);
        cgCleanupId = setTimeout(cleanupTempHandlers, TEMP_FUNCTION_CG);
    };
};

/**
 * Define message handlers for a Web Worker
 * 
 * @param e - Object containing handler functions to be registered
 * @returns A function that returns a WorkerEvent object
 * 
 * @example
 * ```ts
 * // worker.ts
 * import { defineReceive } from 'typed-worker';
 * 
 * export default defineReceive({
 *   add: (a: number, b: number) => a + b,
 *   getData: async () => {
 *     const response = await fetch('https://api.example.com/data');
 *     return response.json();
 *   }
 * });
 * ```
 */
/**
 * 定义Worker线程中可用的方法
 * @template T - 包含方法签名的对象类型
 * @param {T} handlers - 包含Worker方法的对象
 * @returns {() => WorkerEvent<T>} - 返回Worker初始化函数
 * 
 * @example
 * // worker.ts
 * export default defineReceive({
 *   add(a: number, b: number) {
 *     return a + b;
 *   },
 *   async fetchData(url: string) {
 *     const response = await fetch(url);
 *     return response.json();
 *   }
 * });
 */
export const defineReceive = <T extends Record<string, (...args: any[]) => any>>(handlers: T) => {
    const event = createRuntime(self);
    Object.entries(handlers).forEach(([name, fn]) => {
        event.handlers.set(name, fn);
    });
    self.onmessage = messageHandler(event);
    return null as unknown as () => WorkerEvent<T>;
}

/**
 * Worker回调函数类型
 * @template T - 原始函数类型
 * @property {Transferable[]} transfer - 可传输对象列表
 * @property {number} timeout - 调用超时时间（毫秒）
 * 
 * @example
 * const callback: WorkerCallBack<(a: number, b: number) => number> = async (a, b) => a + b;
 * callback.transfer = [];
 * callback.timeout = 5000;
 */
export type WorkerCallBack<T> = (T extends (...args: any[]) => any ? (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>> : never) & {
    transfer: Transferable[];
    timeout: number;
};

/**
 * Worker事件类型
 * @template T - 包含Worker方法签名的对象类型
 * @property {Worker} worker - Web Worker实例
 * @property {RuntimeEvent} event - 运行时事件对象
 * @property {Function} cb - 回调函数创建器
 * @property {Object} methods - 类型安全的Worker方法集合
 * @property {number} methods.timeout - 全局方法调用超时时间（毫秒）
 * 
 * @example
 * const workerEvent: WorkerEvent<{
 *   add(a: number, b: number): number;
 *   fetchData(url: string): Promise<any>;
 * }> = {
 *   worker: new Worker('worker.js'),
 *   event: createRuntime(worker),
 *   cb: (fn, name) => ({ ...fn, transfer: [], timeout: 5000 }),
 *   methods: {
 *     add: async (a, b) => a + b,
 *     fetchData: async (url) => fetch(url).then(res => res.json()),
 *     timeout: 5000
 *   }
 * };
 */
type WorkerEvent<T extends Record<string, (...args: any[]) => any>> = {
    worker: Worker;
    event: RuntimeEvent
    cb: <F extends Function>(e: F, name?: string) => WorkerCallBack<F>;
    methods: { [K in keyof T]: WorkerCallBack<T[K]>; } & { timeout: number; }
}

/**
 * Create a typed interface for communicating with a Web Worker
 * 
 * @param worker - Web Worker instance to communicate with
 * @returns WorkerEvent object containing typed methods matching the worker's handlers
 * 
 * @example
 * ```ts
 * // main.ts
 * import { useWorker } from 'typed-worker';
 * 
 * const worker = new Worker('worker.js');
 * 
 * interface WorkerAPI {
 *   add(a: number, b: number): number;
 *   getData(): Promise<any>;
 * }
 * 
 * const { methods } = useWorker<WorkerAPI>(worker);
 * 
 * // Type-safe worker calls
 * const sum = await methods.add(1, 2); // Returns: 3
 * const data = await methods.getData(); // Returns API data
 * 
 * // Configure timeout for all methods
 * methods.timeout = 10000; // 10 seconds
 * 
 * // Configure transferable objects
 * const { getData } = methods;
 * const buffer = new ArrayBuffer(1024);
 * getData.transfer = [buffer];
 * ```
 */
export const useWorker = <T extends Record<string, (...args: any[]) => any>>(worker: Worker): WorkerEvent<T> => {
    const event = createRuntime(worker);

    const cleanup = () => {
        event.handlers.clear();
        event.promises.forEach(p => p.reject(new Error('Worker connection terminated')));
        event.promises.clear();
    };

    worker.addEventListener('error', (e) => {
        console.error('Worker error:', e);
        cleanup();
    });

    worker.addEventListener('messageerror', (e) => {
        console.error('Worker message error:', e);
        cleanup();
    });

    worker.addEventListener('message', messageHandler(event));

    // @ts-ignore
    return {
        worker,
        event,
        cb: (e, name) => {
            let id = name || generateUniqueId(event);
            while (!name && event.handlers.has(id)) {
                id = TEMP_NAME_PREFIX + Math.random().toString(36).slice(2);
            }
            event.handlers.set(id, e);
            return {
                _IS_TRANSFORMED_: true,
                type: 'fn',
                id, // Use the same id for both handler and transformed object
            }
        },
        methods: new Proxy({
            timeout: 5000,
        }, {
            get(_target, name) {
                if (Reflect.has(_target, name)) return Reflect.get(_target, name);
                const fn = function (...args: any[]) {
                    // @ts-ignore
                    return createRequest(event, name as string, args, fn.transfer, fn.timeout);
                }
                // @ts-ignore
                fn.transfer = [];
                fn.timeout = Reflect.get(_target, 'timeout');
                return fn;
            }
        })
    } as WorkerEvent<T>
};
