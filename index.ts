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
    let cgCleanupId: any;

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
 * Define message handlers for a Web Worker or iframe (auto-detects environment)
 *
 * @param e - Object containing handler functions to be registered
 * @returns A function that returns a WorkerEvent object
 *
 * @example
 * ```ts
 * // worker.ts or iframe content
 * import { defineReceive } from 'better-webworker';
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
export const defineReceive = <T extends Record<string, (...args: any[]) => any>>(handlers: T) => {
    // Auto-detect environment: Worker or iframe
    const isIframe = typeof window !== 'undefined' && window.parent !== window;

    if (isIframe) {
        // iframe: create a runtime for sending responses back to parent
        const thread = window.parent;
        const event = createRuntime(thread as any);

        Object.entries(handlers).forEach(([name, fn]) => {
            event.handlers.set(name, fn);
        });

        // iframe: listen for messages from parent window
        const wrappedMessageHandler = messageHandler(event);
        const iframeMessageHandler = (e: MessageEvent) => {
            if (e.source !== window.parent) return;
            wrappedMessageHandler(e);
        };
        window.addEventListener('message', iframeMessageHandler);
    } else {
        // Worker: use standard onmessage
        const thread = self;
        const event = createRuntime(thread as any);

        Object.entries(handlers).forEach(([name, fn]) => {
            event.handlers.set(name, fn);
        });

        self.onmessage = messageHandler(event);
    }

    return null as unknown as () => WorkerEvent<T> | IframeEvent<T>;
};

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
    destroy: () => void;
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

    const messageHandlerFn = messageHandler(event);

    worker.addEventListener('error', (e) => {
        console.error('Worker error:', e);
        cleanup();
    });

    worker.addEventListener('messageerror', (e) => {
        console.error('Worker message error:', e);
        cleanup();
    });

    worker.addEventListener('message', messageHandlerFn);

    // 销毁函数
    const destroy = () => {
        worker.removeEventListener('message', messageHandlerFn);
        cleanup();
        worker.terminate();
    };

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
        }),
        destroy
    } as WorkerEvent<T>
};

/**
 * iframe事件类型，与WorkerEvent接口保持一致
 * @template T - 包含iframe方法签名的对象类型
 */
type IframeEvent<T extends Record<string, (...args: any[]) => any>> = {
    iframe: HTMLIFrameElement;
    event: RuntimeEvent;
    cb: <F extends Function>(e: F, name?: string) => WorkerCallBack<F>;
    methods: { [K in keyof T]: WorkerCallBack<T[K]>; } & { timeout: number; };
    destroy: () => void;
}

/**
 * 创建一个基于iframe的通信接口，API与useWorker完全一致
 *
 * @param url - iframe要加载的URL
 * @returns IframeEvent对象，包含类型安全的方法集合
 *
 * @example
 * ```ts
 * // main.ts
 * import { useIframe } from 'better-webworker';
 *
 * interface IframeAPI {
 *   add(a: number, b: number): number;
 *   getData(): Promise<any>;
 * }
 *
 * const { methods, destroy } = useIframe<IframeAPI>('/iframe-worker.html');
 *
 * // 类型安全的调用，与useWorker完全一致
 * const sum = await methods.add(1, 2);
 * const data = await methods.getData();
 *
 * // 配置超时时间
 * methods.timeout = 10000;
 *
 * // 销毁iframe
 * destroy();
 * ```
 */
export const useIframe = <T extends Record<string, (...args: any[]) => any>>(url: string): IframeEvent<T> => {
    // 直接使用真实的 HTML URL
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position: absolute; width: 0; height: 0; border: 0; visibility: hidden;';
    document.body.appendChild(iframe);

    // 延迟初始化，等待 iframe 加载完成
    let event: RuntimeEvent | null = null;
    let isReady = false;
    const pendingRequests: Array<() => void> = [];

    iframe.onload = () => {
        // iframe 加载完成后初始化 event
        event = createRuntime(iframe.contentWindow as Window);
        isReady = true;

        // 创建消息处理器的包装，过滤来自iframe的消息
        const wrappedMessageHandler = messageHandler(event);
        const iframeMessageHandler = (e: MessageEvent) => {
            if (e.source !== iframe.contentWindow) return;
            wrappedMessageHandler(e);
        };
        window.addEventListener('message', iframeMessageHandler);

        // 执行所有等待的请求
        pendingRequests.forEach(fn => fn());
        pendingRequests.length = 0;
    };

    // 等待 iframe 加载后才能获取 contentWindow
    iframe.src = url;

    const cleanup = () => {
        if (!event) return;
        event.handlers.clear();
        event.promises.forEach(p => p.reject(new Error('Iframe connection terminated')));
        event.promises.clear();
    };

    // 销毁函数
    const destroy = () => {
        cleanup();
        if (iframe.parentNode) {
            document.body.removeChild(iframe);
        }
    };

    // iframe加载错误处理
    iframe.onerror = (e) => {
        console.error('Iframe error:', e);
        cleanup();
    };

    // @ts-ignore
    return {
        iframe,
        event: null as any,
        cb: (e, name) => {
            if (!isReady) throw new Error('Iframe not ready');
            let id = name || generateUniqueId(event!);
            while (!name && event!.handlers.has(id)) {
                id = TEMP_NAME_PREFIX + Math.random().toString(36).slice(2);
            }
            event!.handlers.set(id, e);
            return {
                _IS_TRANSFORMED_: true,
                type: 'fn',
                id,
            }
        },
        methods: new Proxy({
            timeout: 5000,
        }, {
            get(_target, name) {
                if (Reflect.has(_target, name)) return Reflect.get(_target, name);
                const fn = function (...args: any[]) {
                    return new Promise((resolve, reject) => {
                        const executeRequest = () => {
                            if (!event) {
                                reject(new Error('Iframe not initialized'));
                                return;
                            }
                            // @ts-ignore
                            createRequest(event, name as string, args, fn.transfer, fn.timeout)
                                .then(resolve)
                                .catch(reject);
                        };

                        if (isReady) {
                            executeRequest();
                        } else {
                            pendingRequests.push(executeRequest);
                        }
                    });
                }
                // @ts-ignore
                fn.transfer = [];
                fn.timeout = Reflect.get(_target, 'timeout');
                return fn;
            }
        }),
        destroy
    } as IframeEvent<T>
};
