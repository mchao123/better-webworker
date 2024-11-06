/**
 * Vite plugin for better web worker support
 * 
 * @param reg - Regular expression to match worker files, defaults to /\.worker.ts$/
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
 *     betterWorker() // Use default .worker.ts pattern
 *     // Or customize pattern:
 *     // betterWorker(/\.worker\.(ts|js)$/)
 *   ]
 * })
 * ```
 */
export default (reg: RegExp = /\.worker.ts$/) => {
    return {
        name: 'better-worker',
        transform(_: string, id: string) {
            if (!reg.test(id))
                return;
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
