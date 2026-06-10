[English](https://github.com/mchao123/better-webworker/blob/main/README.md) | [中文](https://github.com/mchao123/better-webworker/blob/main/README.zh-CN.md)

# Better WebWorker

[![npm version](https://img.shields.io/npm/v/better-webworker.svg)](https://www.npmjs.com/package/better-webworker)
[![npm downloads](https://img.shields.io/npm/dm/better-webworker.svg)](https://www.npmjs.com/package/better-webworker)
[![license](https://img.shields.io/npm/l/better-webworker.svg)](https://github.com/mchao123/better-webworker/blob/main/LICENSE)

一个用于创建类型安全的Web Worker和iframe通信的库，提供更好的开发体验和类型安全。

## 特性

- 类型安全的Worker/iframe通信
- **双模式支持**：WebWorker 或 iframe（API完全一致）
- 支持函数传输和反序列化
- 自动处理Worker/iframe生命周期
- 内置超时控制和错误处理
- 与Vite无缝集成

## 安装

```bash
npm install better-webworker
```

## 使用

### 主线程

```typescript
import { useWorker } from 'better-webworker';

// 创建Worker实例
const worker = new Worker(new URL('./worker.ts', import.meta.url), {
  type: 'module'
});

// 获取类型安全的接口
const { methods, destroy } = useWorker<{
  add(a: number, b: number): number;
  fetchData(url: string): Promise<any>;
}>(worker);

// 调用Worker方法
const sum = await methods.add(1, 2); // 3
const data = await methods.fetchData('https://api.example.com/data');

// 使用完毕后清理资源
destroy();
```

### Worker线程

```typescript
import { defineReceive } from 'better-webworker';

export default defineReceive({
  add(a: number, b: number) {
    return a + b;
  },
  
  async fetchData(url: string) {
    const response = await fetch(url);
    return response.json();
  }
});
```

### Vite配置

```typescript
import { defineConfig } from 'vite';
import betterWorker from 'better-webworker/vite';

export default defineConfig({
  plugins: [
    // WebWorker 模式（默认）
    betterWorker() // 默认处理.worker.ts文件
    
    // iframe 模式 - 只需改变一个参数！
    // betterWorker(/\.worker\.ts$/, true)
    
    // 自定义文件匹配模式：
    // betterWorker(/\.worker\.(ts|js)$/)
  ]
});
```

**关键特性**：使用 iframe 模式（`isIframe: true`）时，插件名称会自动变更为 `better-iframe` 方便识别。**Worker 文件代码保持完全相同** - `defineReceive` 会自动检测环境（Worker 或 iframe）并正确初始化！

### iframe 模式使用

```typescript
// example.iframe.ts - Worker 代码（与 WebWorker 完全相同！）
import { defineReceive } from 'better-webworker';

export default defineReceive({
  someTask() {
    return 'Task completed!';
  }
});
```

```typescript
// main.ts - 导入编译后的 iframe worker
import createIframe from './example.iframe';

const { methods, destroy } = createIframe();

// API 与 WebWorker 模式完全一致
await methods.someTask();

// 使用完毕后清理资源
destroy();
```

**重要提示**：
- `useIframe` 不应该被用户直接调用 - 它由 Vite 插件自动处理
- 使用 iframe 模式时，插件会自动生成 HTML 包装文件并管理 iframe 生命周期
- Worker 代码在 Worker 和 iframe 模式之间保持完全相同

详细的 iframe 使用说明请参考 [IFRAME_USAGE.md](./IFRAME_USAGE.md)。

### 自动编译

使用Vite插件时，.worker.ts（或 iframe 模式的 .iframe.ts）文件会被自动编译并生成类型安全的Worker/iframe实例。你只需要直接导入文件即可：

```typescript
// main.ts
import worker from './example.worker';  // WebWorker 模式
// 或
import iframe from './example.iframe';  // iframe 模式

const { methods } = worker();  // 或 iframe()
await methods.someTask();
```

## API

### `useWorker<T>(worker: Worker)`

创建类型安全的Worker接口。

- `worker`: Web Worker实例
- 返回：包含`methods`的对象，`methods`包含所有Worker方法的类型安全接口，以及`destroy()`方法用于清理资源

### `useIframe<T>(url: string)`

**仅供内部使用** - 此函数由 Vite 插件自动调用，不应直接使用。当你导入 iframe worker 文件（例如 `import createIframe from './example.iframe'`）时，插件会自动处理 iframe 的创建和初始化。

- `url`: HTML 包装文件的 URL（由插件自动生成）
- 返回：包含`methods`（与useWorker一致）和`destroy()`方法的对象

### `defineReceive<T>(handlers: T)`

为 Worker 和 iframe 环境定义处理函数。**自动检测环境**（Worker 或 iframe）并正确初始化 - 无需使用不同的函数！

- `handlers`: 包含处理函数的对象
- 返回：Worker/iframe初始化函数

**这个函数在两种环境下都可以使用！**无需 `defineWorkerReceive` 或 `defineIframeReceive`。

## 注意事项

1. 确保Worker文件以`.worker.ts`结尾
2. 使用Vite时，需要配置插件
3. 传输函数时注意闭包问题
4. 合理设置超时时间

## 示例

完整示例请参考[examples目录](https://github.com/mchao123/better-webworker/blob/main/examples)。
