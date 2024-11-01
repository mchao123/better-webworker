# better-webworker

让Web Worker更好用，好使的一批

## 安装

```bash
npm i better-webworker
```

## 配置

```ts
// vite.config.ts
import { defineConfig } from 'vite'
// ...
import betterWebworker from 'better-webworker/vite'
// https://vite.dev/config/
export default defineConfig({
  plugins: [
        // ...
        betterWebworker()
    ],
    // ...
})
```

## 使用

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
import useWorker from './test.worker.ts'

const { methods } = useWorker();
methods.ping('hello world').then(res => {
    console.log(res) // pong hello world
});

```

## 进阶用法

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

## 注意事项

传入的函数默认将会转为字符串在工作线程中执行，如果需要回调，请使用cb包裹，
声明回调类型使用`WorkerCallBack<函数类型>`

## 其他

不咋会写文档，有问题欢迎提issue

## License

MIT