# BangDice

BangDice 是一个面向跑团玩家的 **COC7 骰娘 / 探索型 Bot**，主题为 BanG Dream! 系列中的 Morfonica（モルフォニカ / Mujica）风格。该项目专注于 COC7 规则，支持人物作成、属性管理、检定、技能检定与纯骰功能。

## ✨ 功能特色

- **🎸 乐队模式** - 多人格轮替回复，模拟 BanG Dream! 乐队成员轮流演奏
- **COC7 规则支持** - 完整的克苏鲁的呼唤第七版规则支持
- **属性管理** - 支持设置和管理角色的各种属性
- **多样化检定** - 支持普通、困难、极难、大成功等不同难度检定
- **跑团记录** - 完整的跑团日志记录系统
- **扩展功能** - 理智检定、对抗检定、疯狂症状抽取等
- **模板系统** - BangDream 风格的回复模板
- **属性别名** - 支持多种属性名称别名
- **WebUI 管理** - Vue 3 驱动的现代化管理界面

## 🎸 乐队模式

BangDice 独创的**乐队模式**让骰娘像乐队成员一样轮流"演奏"回复！

### 开启/关闭

```
.band on      # 开启乐队模式
.band off     # 关闭乐队模式
.band status  # 查看当前状态
```

### 效果演示

```
玩家: .band on
🎸 乐队模式已开启！
当前演奏者: 🎸Sayo

玩家: .ra运气
🎸Sayo: 运气检定 d100=45/60 成功！

玩家: .ra力量  
🎹Rinko: 力量检定 d100=78/50 失败...

玩家: .ra敏捷
🌸Lisa: 敏捷检定 d100=12/65 困难成功！
```

### 人格列表 (Roselia 成员)

| 角色 | Emoji | 乐器 | 风格 |
|-----|-------|------|------|
| Sayo | 🎸 | 吉他 | 冷静 |
| Rinko | 🎹 | 键盘 | 温柔 |
| Lisa | 🌸 | 贝斯 | 元气 |
| Yukina | 🎤 | 主唱 | 凛然 |
| Ako | 🦋 | 鼓 | 热血 |

### 特点

- 🎸 **无需多账号** - 单骰娘模拟多人格
- 🔄 **自动轮替** - 每次回复后自动切换
- 📊 **群组独立** - 每个群单独管理状态
- ⚡ **零依赖** - 纯本地实现

## 核心命令

### 基础命令
- `.cocN` - 生成 N 组人物卡
- `.nn昵称` - 绑定角色名
- `.st力量80` - 设置属性数值
- `.ra力量` - 对属性发起检定
- `.ra困难力量` - 困难检定
- `.ra极难力量` - 极难检定
- `.ra大成功力量` - 大成功检定（只在骰出1时成功）
- `.ra图书馆+10` - 技能检定（支持加值）
- `.r表达式` - 常规骰点
- `.show` - 查看当前角色属性
- `.stshow` - 显示角色属性

### COC扩展命令
- `.setcoc [规则号]` - 设置房规（0-5号规则及Delta Green）
- `.rav [技能] @某人` - 对抗检定
- `.sc [成功损失]/[失败损失]` - 理智检定
- `.ti` - 临时性疯狂症状
- `.li` - 总结性疯狂症状
- `.log [操作]` - 跑团日志管理

## 属性别名支持

系统支持多种属性名称别名，例如：
- 运气/运势/运气 ↔ 幸运
- str/STR ↔ 力量
- con/CON ↔ 体质
- siz/SIZ ↔ 体型
- dex/DEX ↔ 敏捷
- app/APP ↔ 外貌
- int/INT ↔ 智力
- pow/POW ↔ 意志
- edu/EDU ↔ 教育
- san/SAN ↔ 理智
- hp/HP ↔ 生命值

## 模板系统

BangDice 使用 YAML 模板系统，支持自定义回复格式。模板文件位于 `roles/text-template.yaml`。

## 技术架构

- **语言**: JavaScript (ES6+)
- **运行环境**: Node.js >= 18
- **协议**: OneBot v11 / NapCat / Lagrange / QQBot 兼容实现
- **通信**: WebSocket 连接
- **前端**: Vue 3 + Socket.IO

## 文件结构

```
BangDice/
├─ src/
│  ├─ core/               # 核心功能
│  │  ├─ coc.js          # COC7 规则检定
│  │  ├─ dice.js         # 骰子表达式解析（安全调度场算法）
│  │  ├─ plugin-loader.js # 插件加载器
│  │  ├─ seal-shim.js    # SealDice 兼容层
│  │  └─ game-logger.js  # 游戏日志记录
│  ├─ utils/              # 工具函数
│  │  ├─ common.js       # 通用工具函数
│  │  ├─ math-parser.js  # 安全数学表达式解析
│  │  ├─ attr-aliases.js # 属性别名映射
│  │  └─ templates.js    # 模板渲染
│  └─ web/                # WebUI 界面
│     ├─ index.html      # Vue 3 管理界面
│     ├─ script.js       # 传统 JS 版本
│     └─ style.css       # BangDream 风格样式
├─ roles/
│  ├─ players.json        # 玩家数据
│  ├─ playerNames.json    # 玩家昵称
│  ├─ text-template.yaml  # 模板文件
│  ├─ log-exports/        # 日志导出目录
│  └─ Plugins/            # 插件目录
│     ├─ coc7.js          # COC7 核心插件
│     ├─ dice.js          # 骰子插件
│     ├─ 运势.js          # 运势插件
│     └─ ...              # 其他插件
├─ webui/                 # Web管理界面入口
├─ logs/                  # 日志目录
│  └─ YYYY-MM-DD.log
├─ build/                 # 构建输出目录
├─ index.js               # 主程序入口
├─ config.json            # 配置文件 (首次运行生成)
├─ package.json           # 项目依赖
└─ README.md              # 项目说明
```

## 运行与部署

首次运行时，程序会自动配置 WebSocket 连接参数：

```bash
node index.js
```

程序会提示输入 OneBot WebSocket 地址和 Access-Token。

默认 WebUI 端口为 4412，访问 `http://localhost:4412` 进行管理。

## 插件系统

BangDice 支持插件扩展，位于 `roles/Plugins/` 目录。系统提供 SealDice 兼容 API，支持动态加载和热重载。

## 依赖

- `js-yaml`: YAML 文件处理
- `ws`: WebSocket 客户端
- `socket.io`: 实时通信

## 开发约定

- 所有命令以 `.` 开头
- 使用 WebSocket 与 OneBot 兼容的机器人框架通信
- 日志按日期分文件存储
- 插件系统兼容 SealDice 插件格式
- 模板系统使用 `{t变量名}` 占位符格式

## 安全特性

- ✅ **调度场算法** - 骰子表达式使用安全的数学解析器，避免代码注入
- ✅ **XSS 防护** - WebUI 所有动态内容经过 HTML 转义
- ✅ **命令冷却** - 防止命令刷屏
- ✅ **API Token** - 敏感操作需要认证

## 更新日志

### v1.1.0
- 🎸 新增乐队模式（多人格轮替回复）
- 🔒 安全性增强：调度场算法替代 Function 构造函数
- 🛡️ XSS 防护：WebUI 所有动态内容转义
- ⚡ 性能优化：命令匹配使用 Map 索引
- 💾 文件写入防抖机制
- 🧹 代码质量：提取魔法数字为配置常量
- 📦 模块化：属性别名提取为共享模块
