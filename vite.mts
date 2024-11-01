
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
