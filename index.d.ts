type RuntimeEvent = {
    thread: Worker | Window;
    handlers: Map<string, Function>;
    promises: Map<string, {
        resolve: Function;
        reject: Function;
    }>;
    cg: WeakMap<Function, number>;
};
export declare const defineReceive: <T extends Record<string, (...args: any[]) => any>>(e: T) => () => WorkerEvent<T>;
export type WorkerCallBack<T> = (T extends (...args: any[]) => any ? (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>> : never) & {
    transfer: Transferable[];
    timeout: number;
};
type WorkerEvent<T extends Record<string, (...args: any[]) => any>> = {
    worker: Worker;
    event: RuntimeEvent;
    cb: <T extends (...args: any[]) => any>(e: T, name?: string) => any;
    methods: {
        [K in keyof T]: WorkerCallBack<T[K]>;
    };
};
export declare const useWorker: <T extends Record<string, (...args: any[]) => any>>(worker: Worker) => WorkerEvent<T>;
export {};
