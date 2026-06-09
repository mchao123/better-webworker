# WebWorker vs iframe 模式对比示例

这个示例展示了如何使用相同的代码在 WebWorker 和 iframe 两种模式之间切换。

## 文件结构

```
examples/comparison/
├── worker.worker.ts          # Worker/iframe 端代码（两种模式共用）
├── main-worker.ts            # 使用 WebWorker 模式的主线程代码
├── main-iframe.ts            # 使用 iframe 模式的主线程代码
└── vite.config.worker.ts     # WebWorker 模式的 Vite 配置
└── vite.config.iframe.ts     # iframe 模式的 Vite 配置
```

## Worker/iframe 端代码（两种模式共用）

```typescript
// worker.worker.ts
import { defineReceive } from 'better-webworker';

export default defineReceive({
  // 简单计算
  add(a: number, b: number) {
    return a + b;
  },

  // 异步操作
  async fetchData(url: string) {
    const response = await fetch(url);
    return response.json();
  },

  // CPU 密集型任务
  fibonacci(n: number): number {
    if (n <= 1) return n;
    return this.fibonacci(n - 1) + this.fibonacci(n - 2);
  }
});
```

## WebWorker 模式

### Vite 配置

```typescript
// vite.config.worker.ts
import { defineConfig } from 'vite';
import betterWorker from 'better-webworker/vite';

export default defineConfig({
  plugins: [
    betterWorker() // 使用默认的 WebWorker 模式
  ]
});
```

### 主线程代码

```typescript
// main-worker.ts
import { useWorker } from 'better-webworker';
import createWorker from './worker.worker';

interface WorkerAPI {
  add(a: number, b: number): number;
  fetchData(url: string): Promise<any>;
  fibonacci(n: number): number;
}

const { methods } = createWorker() as ReturnType<typeof useWorker<WorkerAPI>>;

// 使用方法
const sum = await methods.add(1, 2);
console.log('Sum:', sum); // 3

const data = await methods.fetchData('https://api.example.com/data');
console.log('Data:', data);

const fib = await methods.fibonacci(10);
console.log('Fibonacci(10):', fib); // 55
```

## iframe 模式

### Vite 配置

```typescript
// vite.config.iframe.ts
import { defineConfig } from 'vite';
import betterWorker from 'better-webworker/vite';

export default defineConfig({
  plugins: [
    betterWorker(/\.worker\.ts$/, true) // 启用 iframe 模式
  ]
});
```

### 主线程代码

```typescript
// main-iframe.ts
import { useIframe } from 'better-webworker';
import createIframe from './worker.worker';

interface WorkerAPI {
  add(a: number, b: number): number;
  fetchData(url: string): Promise<any>;
  fibonacci(n: number): number;
}

const { methods, destroy } = createIframe() as ReturnType<typeof useIframe<WorkerAPI>>;

// 使用方法（API 完全一致）
const sum = await methods.add(1, 2);
console.log('Sum:', sum); // 3

const data = await methods.fetchData('https://api.example.com/data');
console.log('Data:', data);

const fib = await methods.fibonacci(10);
console.log('Fibonacci(10):', fib); // 55

// 不再需要时清理资源
destroy();
```

## 关键区别

| 特性 | WebWorker 模式 | iframe 模式 |
|------|---------------|------------|
| Vite 插件配置 | `betterWorker()` | `betterWorker(/\.worker\.ts$/, true)` |
| 插件名称 | `better-worker` | `better-iframe` |
| 导入函数 | `useWorker` | `useIframe` |
| 定义函数 | `defineReceive` | `defineIframeReceive` |
| 返回值 | `{ methods, worker, event, cb }` | `{ methods, iframe, event, cb, destroy }` |
| 资源清理 | 自动 | 需要调用 `destroy()` |
| 线程隔离 | 真正的多线程 | 运行在主线程 |
| DOM 访问 | ❌ 不可访问 | ✅ 可访问（iframe 内部） |
| 性能 | 更好（独立线程） | 较低（主线程） |

## 使用场景建议

### 使用 WebWorker 模式

- CPU 密集型计算（如图像处理、数据处理）
- 后台任务（如数据同步、日志处理）
- 不需要访问 DOM 的任务
- 需要真正的并行处理

### 使用 iframe 模式

- 需要 DOM 访问的任务
- 需要沙箱隔离的第三方脚本
- 需要完整的浏览器环境
- 需要加载完整的 HTML 页面
- UI 相关的隔离组件

## 性能对比

运行以下测试来对比两种模式的性能：

```typescript
// 测试计算密集型任务
console.time('Worker Mode');
const workerResult = await workerMethods.fibonacci(40);
console.timeEnd('Worker Mode');

console.time('iframe Mode');
const iframeResult = await iframeMethods.fibonacci(40);
console.timeEnd('iframe Mode');
```

预期结果：WebWorker 模式会更快，因为它运行在独立线程中，不会阻塞主线程。
