# BangDice

<img src="https://anime.bang-dream.com/avemujica/wordpress/wp-content/uploads/2024/12/13132640/AM_wallpaper_PC3.jpg" width="260"/>

**BangDice** 是一个面向跑团玩家的 **COC7 骰娘 / 探索型 Bot**。  
主题为 **BanG Dream!** 系列中的 **Morfonica（モルフォニカ / Mujica）** 风格

TODO: 添加更多功能

## TODO

- 添加COC7规则支持
- 实现人物作成、属性管理、检定、技能检定与纯骰功能
- 完善更多指令和功能

## 部署方式

首次运行自动配置：

```
node index.js
```

## 运行依赖

- Node.js >= 18
- OneBot v11 / NapCat / Lagrange / QQBot 兼容实现

## 文件结构

```
BangDice/
├─ src/
│  ├─ core/
│  │  ├─ index.js
│  │  ├─ coc.js
│  │  ├─ dice.js
│  │  ├─ plugin-loader.js
│  │  └─ seal-shim.js
│  ├─ utils/
│  │  └─ templates.js
│  └─ web/
│     ├─ index.html
│     ├─ style.css
│     ├─ script.js
│     ├─ favicon.ico
│     └─ favicon.svg
├─ roles/
├─ logs/
├─ config.json
├─ package.json
└─ README.md
```

## WebUI 管理界面

BangDice 提供了一个现代化的 WebUI 管理界面，可通过浏览器访问。界面具有 BanG Dream! 风格设计，启动后访问 `http://localhost:4412` 即可使用。

## 自定义扩展

新增：

```
roles/Plugins/
```

放入脚本即可自动加载。

## 免责声明

BangDice 与 BanG Dream! 系列无商业关联，仅供个人跑团使用。
