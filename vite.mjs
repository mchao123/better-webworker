
/**
 * vite plugin for better-webworker
 * @param {RegExp} reg - file match regex
 */
export default (reg = /\.worker.ts$/) => {
    return {
        name: 'better-worker',
        transform(_, id) {
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
