export default (reg: RegExp = /\.worker.ts$/, isIframe: boolean = false) => {
    const iframeModules = new Map<string, { baseName: string; hash: string }>();
    let isBuild = false;

    return {
        name: isIframe ? 'better-iframe' : 'better-worker',
        configResolved(config: any) {
            isBuild = config.command === 'build';
        },
        resolveId(id: string) {
            if (id.includes('?iframe-entry') || id.includes('?iframe-raw') || id.includes('?iframe-html-file') || id.includes('?iframe-html')) {
                return id;
            }
        },
        load(id: string) {
            if (id.includes('?iframe-entry')) {
                const originalId = id.split('?iframe-entry')[0];
                return `import '${originalId}?iframe-raw';`;
            }
            if (id.includes('?iframe-raw')) {
                return null;
            }
            if (id.includes('?iframe-html-file')) {
                const originalId = id.split('?iframe-html-file')[0];

                if (isBuild) {
                    // 生产环境：返回生成的 HTML 文件
                    const info = iframeModules.get(originalId);
                    if (info) {
                        return `export default new URL('./${info.hash}.html', import.meta.url).href;`;
                    }
                }

                // 开发环境：返回动态 HTML URL
                return `export default '${originalId}?iframe-html';`;
            }
        },
        configureServer(server: any) {
            if (!isIframe) return;

            server.middlewares.use((req: any, res: any, next: any) => {
                if (req.url && req.url.includes('?iframe-html') && !req.url.includes('?iframe-html-file')) {
                    const scriptUrl = req.url.split('?iframe-html')[0] + '?iframe-entry';
                    const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body>
<script type="module" src="${scriptUrl}"></script>
</body>
</html>`;
                    res.setHeader('Content-Type', 'text/html');
                    res.end(html);
                } else {
                    next();
                }
            });
        },
        generateBundle(this: any, options: any, bundle: any) {
            if (!isIframe) return;

            iframeModules.forEach((info, moduleId) => {
                let targetChunk = null;
                const entryId = `${moduleId}?iframe-entry`;
                const rawId = `${moduleId}?iframe-raw`;

                for (const fileName in bundle) {
                    const chunk = bundle[fileName];
                    if (chunk.type === 'chunk' && chunk.modules) {
                        const moduleIds = Object.keys(chunk.modules);
                        const found = moduleIds.find(id =>
                            id === entryId ||
                            id === rawId ||
                            id.includes(info.hash)
                        );

                        if (found) {
                            targetChunk = fileName;
                            break;
                        }
                    }
                }

                if (targetChunk) {
                    const htmlFileName = `assets/${info.hash}.html`;
                    const jsFileName = targetChunk.split('/').pop() || targetChunk;
                    const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body>
<script type="module" src="./${jsFileName}"></script>
</body>
</html>`;

                    this.emitFile({
                        type: 'asset',
                        fileName: htmlFileName,
                        source: html
                    });
                }
            });
        },
        transform(this: any, _: string, id: string) {
            if (id.includes('?iframe-entry') || id.includes('?iframe-raw') || id.includes('?iframe-html') || id.includes('?iframe-html-file'))
                return;

            if (!reg.test(id))
                return;

            if (isIframe) {
                const baseName = id.split('/').pop()?.replace(/\.(ts|js)$/, '') || 'iframe';
                const hash = Math.random().toString(36).substring(2, 10);
                const entryId = `${id}?iframe-entry`;

                iframeModules.set(id, { baseName, hash });

                // 在 transform 时 emit chunk
                this.emitFile({
                    type: 'chunk',
                    id: entryId,
                    fileName: `assets/iframe-${hash}.js`
                });

                return {
                    code: `import { useIframe } from 'better-webworker'
import htmlUrl from '${id}?iframe-html-file'

export default () => {
    return useIframe(htmlUrl);
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
