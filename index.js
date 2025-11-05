import fs from "fs";
import path from "path";
import readline from "readline";
import WebSocket from "ws";
import { loadTemplates, renderKey } from "./templates.js";
import { rollExpr } from "./data/dice.js";
import { resultCheck, successRankToKey } from "./data/coc.js";

// 主程序与指令路由

const logDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const rolePluginDir = path.join(process.cwd(), "roles", "Plugins");
if (!fs.existsSync(rolePluginDir)) fs.mkdirSync(rolePluginDir, { recursive: true });

function log(msg) {
  const time = new Date();
  const stamp = time.toISOString().replace("T", " ").split(".")[0];
  const day = time.toISOString().split("T")[0];
  const line = `[${stamp}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(path.join(logDir, `${day}.log`), line + "\n", "utf8");
  } catch (e) {
    // 忽略写日志错误，保持运行
  }
}

// 玩家管理
const tpl = loadTemplates();
const playersFile = path.join(process.cwd(), "roles", "players.json");
let players = fs.existsSync(playersFile) ? JSON.parse(fs.readFileSync(playersFile, "utf8")) : {};

function savePlayers() {
  try {
    fs.writeFileSync(playersFile, JSON.stringify(players, null, 2));
  } catch (e) {
    log("保存 players.json 失败: " + e.message);
  }
}

function getPlayer(uid) {
  players[uid] = players[uid] || { attrs: {}, name: null };
  return players[uid];
}

// 配置管理
const configPath = path.join(process.cwd(), "config.json");
async function ensureConfig() {
  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch (e) {
      log("读取 config.json 出错，重新生成: " + e.message);
    }
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(res => rl.question(q, ans => res(ans.trim())));

  console.log("首次运行，进行基础配置：");
  const ws = await ask("请输入 OneBot WebSocket 地址 (默认 ws://127.0.0.1:3001): ") || "ws://127.0.0.1:3001";
  const token = await ask("请输入 Access-Token (没有请留空): ") || "";

  rl.close();
  const cfg = { ws, token };
  try {
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), "utf8");
    log("已生成 config.json");
  } catch (e) {
    log("写入 config.json 失败: " + e.message);
  }
  return cfg;
}

const config = await ensureConfig();

const ws = new WebSocket(config.ws, config.token ? { headers: { Authorization: `Bearer ${config.token}` } } : {});

ws.on("open", () => log("已连接: " + config.ws));
ws.on("close", () => log("连接已关闭"));
ws.on("error", err => log("WebSocket 错误: " + (err && err.message ? err.message : String(err))));

ws.on("message", raw => {
  let e;
  try {
    e = JSON.parse(raw.toString());
  } catch (err) {
    log("收到无法解析的消息: " + err.message);
    return;
  }
  if (e.post_type !== "message" || e.message_type !== "group") return;
  const text = (e.message || []).map(i => i.data?.text || "").join("").trim();
  if (!text) return;

  if (text.startsWith(".coc")) handleCocCard(e, ws, text.slice(4));
  else if (text.startsWith(".ra")) handleRa(e, ws, text.slice(3));
  else if (text.startsWith(".rt")) handleRt(e, ws, text.slice(3));
  else if (text.startsWith(".st")) handleSt(e, ws, text.slice(3));
  else if (text.startsWith(".nn")) handleNn(e, ws, text.slice(3));
  else if (text.startsWith(".r")) handleR(e, ws, text.slice(2));
  else if (text.startsWith(".show")) handleShow(e, ws);
});

function sendGroupMsg(ws, group_id, text) {
  try {
    ws.send(JSON.stringify({ action: "send_group_msg", params: { group_id, message: text } }));
  } catch (e) {
    log("发送群消息失败: " + e.message);
  }
}

// 指令处理
function handleRa(e, ws, arg) {
  const p = getPlayer(e.user_id);
  const key = arg.trim();
  const target = isFinite(key) ? Number(key) : p.attrs[key];
  if (!target) {
    sendGroupMsg(ws, e.group_id, `未找到属性 ${key}`);
    return;
  }
  const d100 = Math.floor(Math.random() * 100) + 1;
  const { successRank } = resultCheck(0, d100, target, 1);
  const msg = renderKey(tpl, successRankToKey(successRank), {
    玩家: p.name || e.sender.nickname,
    出目: d100,
    判定值: target,
    属性: key
  });
  sendGroupMsg(ws, e.group_id, msg);
  log(`.ra ${key} => ${p.name || e.sender.nickname} ${d100}/${target}`);
}

function handleRt(e, ws, arg) {
  const p = getPlayer(e.user_id);
  const sMatch = arg.match(/([^\d]+)(-?\d+)?/);
  const skillName = sMatch ? (sMatch[1] || "").trim() : "";
  const bonus = sMatch && sMatch[2] ? parseInt(sMatch[2]) : 0;
  if (!skillName || !p.attrs[skillName]) {
    sendGroupMsg(ws, e.group_id, `未找到技能 ${skillName}`);
    return;
  }
  const d100 = Math.floor(Math.random() * 100) + 1;
  const { successRank } = resultCheck(3, d100, p.attrs[skillName], 1, { skillBonus: bonus });
  const msg = renderKey(tpl, successRankToKey(successRank), {
    玩家: p.name || e.sender.nickname,
    出目: d100,
    判定值: p.attrs[skillName] + bonus,
    属性: skillName
  });
  sendGroupMsg(ws, e.group_id, msg);
  log(`.rt ${skillName}${bonus ? bonus : ""} => ${p.name || e.sender.nickname} ${d100}/${p.attrs[skillName] + bonus}`);
}

function handleSt(e, ws, arg) {
  const m = arg.match(/([^\d]+)(-?\d+)/);
  if (!m) {
    sendGroupMsg(ws, e.group_id, "格式错误");
    return;
  }
  const name = m[1].trim(), val = Number(m[2]);
  getPlayer(e.user_id).attrs[name] = val;
  savePlayers();
  sendGroupMsg(ws, e.group_id, `已设置 ${name} = ${val}`);
  log(`.st ${name}=${val} (${e.user_id})`);
}

function handleNn(e, ws, arg) {
  const name = arg.trim();
  if (!name) {
    sendGroupMsg(ws, e.group_id, "格式错误");
    return;
  }
  getPlayer(e.user_id).name = name;
  savePlayers();
  sendGroupMsg(ws, e.group_id, `已绑定角色：${name}`);
  log(`.nn ${name} (${e.user_id})`);
}

function handleR(e, ws, arg) {
  const expr = arg.trim();
  const val = rollExpr(expr);
  if (val == null) {
    sendGroupMsg(ws, e.group_id, "表达式错误");
    return;
  }
  sendGroupMsg(ws, e.group_id, `${expr} = ${val}`);
  log(`.r ${expr} => ${val}`);
}

function handleShow(e, ws) {
  const p = getPlayer(e.user_id);
  const info = `角色名: ${p.name || "未设置"}\n属性: ${JSON.stringify(p.attrs)}`;
  sendGroupMsg(ws, e.group_id, info);
  log(`.show (${e.user_id})`);
}

function handleCocCard(e, ws, arg) {
  const p = getPlayer(e.user_id);
  const MAX_COC_CARD_GEN = 5;
  let count = parseInt(arg) || 1;
  if (count > MAX_COC_CARD_GEN) count = MAX_COC_CARD_GEN;

  const chineseNums = ["壹","贰","叁","肆","伍","陆","柒","捌","玖","拾"];
  const allResults = [];

  for (let i = 0; i < count; i++) {
    const attrsExpr = {
      力量: "3d6*5", 敏捷: "3d6*5", 意志: "3d6*5",
      体质: "3d6*5", 外貌: "3d6*5", 教育: "(2d6+6)*5",
      体型: "(2d6+6)*5", 智力: "(2d6+6)*5", 幸运: "3d6*5"
    };
    const vals = {};
    let total = 0;
    for (const [k, expr] of Object.entries(attrsExpr)) {
      const v = Math.floor(rollExpr(expr));
      vals[k] = v;
      total += v;
    }

    const hp = Math.floor((vals["体质"] + vals["体型"])/10);
    const sumPow = vals["力量"] + vals["体型"];
    let db = "-2";
    if (sumPow >= 65 && sumPow < 85) db = "-1";
    else if (sumPow >= 85 && sumPow < 125) db = "0";
    else if (sumPow >= 125 && sumPow < 165) db = "1d4";
    else if (sumPow >= 165 && sumPow < 205) db = "1d6";

    const expected = 510.0, sigma = 40.0;
    const z = (total - expected) / sigma;
    let starsCount = Math.round(5 + z * 3.5);
    starsCount = Math.min(Math.max(starsCount, 1), 10);
    const stars = "★".repeat(starsCount) + "☆".repeat(10-starsCount);

    const titles = [];
    if (vals["力量"] > 70 && vals["体型"] > 70) titles.push("巨力之躯");
    else if (vals["力量"] > 60) titles.push("力能扛鼎");
    if (vals["敏捷"] > 70 && vals["外貌"] > 65) titles.push("灵光掠影");
    else if (vals["敏捷"] > 60) titles.push("矫健之姿");
    if (vals["智力"] > 70 && vals["教育"] > 70) titles.push("博学贤者");
    else if (vals["智力"] > 60) titles.push("思维敏捷");
    if (vals["意志"] > 70 && vals["体质"] > 65) titles.push("钢铁意志");
    else if (vals["意志"] > 60) titles.push("坚定之心");
    if (vals["幸运"] > 70) titles.push("命运的宠儿");
    if (titles.length === 0) titles.push("平凡旅者");
    if (titles.length > 2) titles.splice(2);

    const msgText = `【${chineseNums[i%chineseNums.length]}】「${titles.join("・")}」\n`+
                    `${stars}\n`+
                    `力量:${vals["力量"]} 敏捷:${vals["敏捷"]} 意志:${vals["意志"]}\n`+
                    `体质:${vals["体质"]} 外貌:${vals["外貌"]} 教育:${vals["教育"]}\n`+
                    `体型:${vals["体型"]} 智力:${vals["智力"]} 幸运:${vals["幸运"]}\n`+
                    `HP:${hp} <DB:${db}> [${total - vals["幸运"]}/${total}]`;
    allResults.push(msgText);
  }

  const finalMsg = `「${p.name || "玩家"}」的属性分配:\n` + allResults.join("\n----------------------\n");
  sendGroupMsg(ws, e.group_id, finalMsg);
  log(`.coc count=${count} (${e.user_id})`);
}
