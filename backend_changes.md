要实现插件的真正启用/禁用功能，需要修改后端代码以检查插件状态。以下是需要更改的部分：

1. 在 index.js 文件中，找到消息处理部分：

```javascript
ws.on("message", raw => {
  // ... 现有代码 ...
  
  if (bot.dispatchPlugin(text, e, ws, sendGroupMsg)) return;
});
```

2. 修改 loadPlugins 函数或相关部分，确保 dispatchPlugin 函数会检查 pluginStatus：

```javascript
// 在 dispatchPlugin 函数中添加状态检查
function dispatchPlugin(text, event, ws, sendFn) {
  // 现有代码...
  
  // 在执行插件前检查插件是否被禁用
  if (pluginStatus && !pluginStatus.get(pluginName)) {
    // 插件被禁用，不执行
    return false;
  }
  
  // 执行插件...
}
```

3. 确保在 plugin_action 事件处理中更新插件状态：

```javascript
socket.on('plugin_action', (data) => {
  log(`插件操作: ${data.action} ${data.plugin}`);
  
  // 更新插件状态
  if (typeof pluginStatus !== 'undefined') {
    const isEnabled = data.action === 'enable';
    pluginStatus.set(data.plugin, isEnabled);
  }
});
```

这些修改将使后端真正实现插件的启用/禁用功能，确保被禁用的插件不会被执行。