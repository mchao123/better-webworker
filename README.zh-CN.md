[English](https://github.com/mchao123/better-webworker/blob/main/README.md) | [中文](https://github.com/mchao123/better-webworker/blob/main/README.zh-CN.md)

# Better WebWorker

一个用于创建类型安全的Web Worker通信的库，提供更好的开发体验和类型安全。

## 特性

- 类型安全的Worker通信
- 支持函数传输和反序列化
- 自动处理Worker生命周期
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
const { methods } = useWorker<{
  add(a: number, b: number): number;
  fetchData(url: string): Promise<any>;
}>(worker);

// 调用Worker方法
const sum = await methods.add(1, 2); // 3
const data = await methods.fetchData('https://api.example.com/data');
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
    betterWorker() // 默认处理.worker.ts文件
    // 自定义文件匹配模式：
    // betterWorker(/\.worker\.(ts|js)$/)
  ]
});
```

### 自动编译

使用Vite插件时，.worker.ts文件会被自动编译并生成类型安全的Worker实例。你只需要直接导入Worker文件即可：

```typescript
// main.ts
import worker from './example.worker';

const { methods } = worker();
await methods.someTask();
```

## API

### `useWorker<T>(worker: Worker)`

创建类型安全的Worker接口。

- `worker`: Web Worker实例
- 返回：包含`methods`的对象，`methods`包含所有Worker方法的类型安全接口

### `defineReceive<T>(handlers: T)`

定义Worker端处理函数。

- `handlers`: 包含处理函数的对象
- 返回：Worker初始化函数

## 注意事项

1. 确保Worker文件以`.worker.ts`结尾
2. 使用Vite时，需要配置插件
3. 传输函数时注意闭包问题
4. 合理设置超时时间

## 示例

完整示例请参考[examples目录](https://github.com/mchao123/better-webworker/blob/main/examples)。
