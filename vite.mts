/**
 * Vite plugin for better web worker support
 *
 * @param reg - Regular expression to match worker files, defaults to /\.worker.ts$/
 * @param isIframe - Use iframe instead of web worker, defaults to false
 * @returns Vite plugin configuration object
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { defineConfig } from 'vite'
 * import betterWorker from 'better-webworker/vite'
 *
 * export default defineConfig({
 *   plugins: [
 *     betterWorker() // Use default .worker.ts pattern with WebWorker
 *     // Or use iframe mode:
 *     // betterWorker(/\.worker.ts$/, true)
 *     // Or customize pattern:
 *     // betterWorker(/\.worker\.(ts|js)$/)
 *   ]
 * })
 * ```
 */
export default (reg: RegExp = /\.worker.ts$/, isIframe: boolean = false) => {
    return {
        name: isIframe ? 'better-iframe' : 'better-worker',
        transform(_: string, id: string) {
            if (!reg.test(id))
                return;

            if (isIframe) {
                // For iframe mode, pass the script URL to useIframe
                return {
                    code: `import { useIframe } from 'better-webworker'

export default () => {
    const workerScript = new URL('${id}', import.meta.url).href;
    return useIframe(workerScript);
}`,
                    map: null
                };
            }

            return {
                code: `import { useWorker } from 'better-webworker'
export default () => {
    const worker = new Worker(new URL('${id}', import.meta.url),{ type: 'module' });
    return useWorker(worker);
}`,
                map: null
            };
        }
    };
};
