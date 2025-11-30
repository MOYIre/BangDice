// 无缝兼容插件，现已支持: sealdice
import fs from "fs";
import path from "path";
import { pathToFileURL } from "node:url";   // ★ 修复：载入绝对路径需要 URL
import seal, { extList } from "./seal-shim.js";

globalThis.seal = seal;
export const pluginCmdTable = [];

export default function loadPlugins(bot, send, ws) {
  const dir = path.join(process.cwd(), "roles", "Plugins");
  if (!fs.existsSync(dir)) return;

  async function loadAll() {
    pluginCmdTable.length = 0;
    extList.length = 0;

    const files = fs.readdirSync(dir).filter(f => f.endsWith(".js"));
    for (const file of files) {
      try {
        const full = path.join(dir, file);

        // ★ 修复：Windows 必须转换为 file:// URL
        const url = pathToFileURL(full).href + "?t=" + Date.now();
        await import(url);

        const ext = extList[extList.length - 1];
        if (!ext || !ext.cmdMap) continue;

        const names = Object.keys(ext.cmdMap);
        let help = "";
        for (const n of names) {
          const c = ext.cmdMap[n];
          if (c && c.help) { help = c.help.trim(); break; }
        }
        pluginCmdTable.push({ names, help });
      } catch (err) {
        console.error("插件加载失败:", file, err);
      }
    }
  }

  loadAll();
  fs.watch(dir, { recursive: false }, () => loadAll());

  bot.dispatchPlugin = (text, e, ws, send) => {
    if (typeof text !== "string") return false;
    if (!text.startsWith(".")) return false;

    const stripped = text.slice(1).trim();
    for (const ext of extList) {
      for (const key of Object.keys(ext.cmdMap || {})) {
        if (stripped.startsWith(key)) {
          const cmd = ext.cmdMap[key];
          const argv = { args: stripped.slice(key.length).trim().split(/\s+/) };
          const ctx = {
            send: (msg) => send(ws, e.group_id, msg),
            group_id: e.group_id,
            user_id: e.user_id,
            msg: e
          };
          try { return cmd.solve(ctx, e, argv) !== false; }
          catch (err) { console.error("插件执行错误:", key, err); return false; }
        }
      }
    }
    return false;
  };

  bot.getPluginHelp = (name) => {
    for (const p of pluginCmdTable) {
      if (p.names.includes(name)) return p.help || "无帮助信息";
    }
    return "未找到此插件指令";
  };
}
