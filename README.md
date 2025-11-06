# BangDice

<img src="https://anime.bang-dream.com/avemujica/wordpress/wp-content/uploads/2024/12/13132640/AM_wallpaper_PC3.jpg" width="260"/>

**BangDice** 是一个面向跑团玩家的 **COC7 骰娘 / 探索型 Bot**。  
主题为 **BanG Dream!** 系列中的 **Morfonica（モルフォニカ / Mujica）** 风格

当前版本核心功能集中在 **COC7 规则**，可进行人物作成、属性管理、检定、技能检定与纯骰。

## 功能列表

| 指令 | 说明 | 示例 |
|---|---|---|
| `.cocN` | 生成 N 组人物卡（无空格输入） | `.coc3` |
| `.nn昵称` | 绑定角色名 | `.nn白鹭千聖` |
| `.st力量80` | 设置属性数值 | `.st敏捷75` |
| `.ra力量` | 对属性发起检定 | `.ra体质` |
| `.rt图书馆+10` | 技能检定（支持加值） | `.rt侦查+20` |
| `.r表达式` | 常规骰点 | `.r1d100` |
| `.show` | 查看当前角色属性 | `.show` |

> 所有指令 **指令与参数之间不需要空格**  
> 例：` .ra力量 ` ✅ / ` .ra 力量 ` ✅

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
├─ data/
│  ├─ dice.js
│  └─ coc.js
├─ roles/
│  └─ players.json
├─ logs/
│  └─ YYYY-MM-DD.log
├─ index.js
├─ config.json
└─ README.md
```

## 自定义扩展

新增：

```
roles/Plugins/
```

放入脚本即可自动加载。

## 免责声明

BangDice 与 BanG Dream! 系列无商业关联，仅供个人跑团使用。
