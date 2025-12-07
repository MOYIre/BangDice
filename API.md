# BangDice API 接口文档

BangDice 提供了一组REST API端点，用于管理和监控骰娘机器人。

## 基础URL
所有API请求都以 `/api/` 开头。

## 端点

### GET /api/status
获取系统状态信息

**响应:**
```json
{
  "activeGroups": 5,
  "activePlugins": 8,
  "connected": true,
  "messageCount": 156
}
```

### GET /api/config
获取当前配置

**响应:**
```json
{
  "wsUrl": "ws://127.0.0.1:3001",
  "accessToken": "your_token_here"
}
```

### POST /api/config
更新配置

**请求体:**
```json
{
  "wsUrl": "ws://127.0.0.1:3001",
  "accessToken": "your_token_here"
}
```

**响应:**
```json
{
  "success": true
}
```

### GET /api/plugins
获取插件列表

**响应:**
```json
[
  {
    "name": "log",
    "command": "log",
    "description": "跑团日志记录功能",
    "author": "铭茗",
    "enabled": true
  }
]
```

### GET /api/players
获取角色数据

**响应:**
```json
{
  "group_id": {
    "user_id": {
      "name": "角色名",
      "attrs": {
        "str": 80,
        "con": 70,
        "dex": 65
      }
    }
  }
}
```

### GET /api/logs
获取日志文件列表

**响应:**
```json
{
  "logs": [
    "2025-12-07.log",
    "2025-12-06.log"
  ]
}
```

### POST /api/send-command
发送指令到机器人

**请求体:**
```json
{
  "command": ".help"
}
```

**响应:**
```json
{
  "success": true,
  "command": ".help"
}
```