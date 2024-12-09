# better-webworker

一个让 Web Workers 更易用、支持 TypeScript 类型安全的包装器。

## 安装

```bash
npm i better-webworker
```

## 配置

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import betterWebworker from 'better-webworker/vite.mjs'

export default defineConfig({
  plugins: [
    betterWebworker() // 默认匹配模式: .worker.ts
    // 传入正则用于匹配文件
    // betterWebworker(/\.worker\.ts$/)
  ],
})
```

## 基础用法

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
```ts
// main.ts
import worker from './test.worker';

const { ping } = worker();

console.log(await ping('hello'));
```

## 高级用法

```ts
// ...
const { methods, cb, worker } = useWorker();
const { handleBuffer } = methods;
const buf = new ArrayBuffer(100000);

handleBuffer.transfer = [buf]; // 传递 ArrayBuffer
handleBuffer.timeout = 10000; // 设置超时时间
handleBuffer(buf, cb((newBuf) => {
    console.log('done', newBuf);
    worker.terminate(); // 关闭 worker
}));
// ...
```

## 注意事项

默认传递的函数将作为字符串在 worker 线程中还原然后执行。如果需要使用回调函数，请使用 cb 进行包装。
提供了`WorkerCallBack<>`类型，可以用于申明回调函数的类型。

## 其他

不怎么会写文档，有问题欢迎提 Issues。


<img src="https://github.com/mchao123/better-webworker/blob/main/img/wepay.jpg" width="180"><img src="https://github.com/mchao123/better-webworker/blob/main/img/alipay.jpg" width="180">

有条件的话，随便赏点给孩子吧

## 许可证

MIT
