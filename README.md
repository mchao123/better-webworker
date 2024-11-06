# better-webworker

A TypeScript-friendly wrapper for Web Workers that makes them easier to use with type safety.

[中文](https://github.com/mchao123/better-webworker/blob/main/README.zh-CN.md) | English

## Installation
```bash
npm i better-webworker
```

## Configuration

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import betterWebworker from 'better-webworker/vite.mjs'

export default defineConfig({
  plugins: [
    betterWebworker() // Default pattern: .worker.ts
    // Or customize pattern:
    // betterWebworker(/\.worker\.(ts|js)$/)
  ],
})
```

## Basic Usage

```ts
// test.worker.ts
import { defineReceive } from 'better-webworker'

const ping = (str: string) => {
    console.log(str);
    return 'pong ' + str
}

export default defineReceive({
    ping
});
```

## Advanced Usage

```ts
// ...
const { methods, cb, worker } = useWorker();
const { handleBuffer } = methods;
const buf = new ArrayBuffer(100000);

handleBuffer.transfer = [buf]; // 传递ArrayBuffer
handleBuffer.timeout = 10000; // 设置超时时间
handleBuffer(buf, cb((newBuf) => {
    console.log('done', newBuf);
    worker.terminate(); // 关闭worker
}));
// ...

```

## Notes

The default function will be executed as a string in the worker thread. If you need to use a callback, please wrap it with `cb()`.

## Other

I'm not very good at writing documentation. If you have any questions, please feel free to open an issue.

## License

MIT

