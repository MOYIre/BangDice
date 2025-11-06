import fs from "fs";
import path from "path";
import readline from "readline";
import WebSocket from "ws";
import { loadTemplates, renderKey } from "./templates.js";
import { rollExpr } from "./data/dice.js";
import { resultCheck, successRankToKey } from "./data/coc.js";
import loadPlugins, { pluginCmdTable } from "./data/plugin-loader.js";

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
  try { fs.appendFileSync(path.join(logDir, `${day}.log`), line + "\n", "utf8"); } catch {}
}

const tpl = loadTemplates();
const playersFile = path.join(process.cwd(), "roles", "players.json");
let players = fs.existsSync(playersFile) ? JSON.parse(fs.readFileSync(playersFile, "utf8")) : {};
function savePlayers() { try { fs.writeFileSync(playersFile, JSON.stringify(players, null, 2)); } catch {} }
function getPlayer(uid) { players[uid] = players[uid] || { attrs: {}, name: null }; return players[uid]; }

const configPath = path.join(process.cwd(), "config.json");
async function ensureConfig() {
  if (fs.existsSync(configPath)) return JSON.parse(fs.readFileSync(configPath, "utf8"));
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = q => new Promise(res => rl.question(q, ans => res(ans.trim())));
  const ws = await ask("请输入 OneBot WebSocket 地址 (默认 ws://127.0.0.1:3001): ") || "ws://127.0.0.1:3001";
  const token = await ask("请输入 Access-Token (没有请留空): ") || "";
  rl.close();
  const cfg = { ws, token };
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), "utf8");
  return cfg;
}

const config = await ensureConfig();
const ws = new WebSocket(config.ws, config.token ? { headers: { Authorization: `Bearer ${config.token}` } } : {});
ws.on("open", () => log("已连接: " + config.ws));
ws.on("close", () => log("连接已关闭"));
ws.on("error", err => log("WebSocket 错误: " + err));

function sendGroupMsg(ws, group_id, text) {
  try { ws.send(JSON.stringify({ action: "send_group_msg", params: { group_id, message: text } })); } catch {}
}

const bot = {};
loadPlugins(bot, sendGroupMsg, ws);

ws.on("message", raw => {
  let e;
  try { e = JSON.parse(raw.toString()); } catch { return; }
  if (e.post_type !== "message" || e.message_type !== "group") return;

  let text = (e.message || []).map(i => i.data?.text || "").join("").trim();
  if (!text) return;

  text = text.replace(/^\.([a-zA-Z])(\d)/, ".$1 $2");
  text = text.replace(/^\.([^\s]+)/, (m,a)=>"." + a.toLowerCase());

  if (text.startsWith(".help")) {
    const name = text.slice(5).trim();
    if (name) sendGroupMsg(ws, e.group_id, bot.getPluginHelp(name));
    else sendGroupMsg(ws, e.group_id,
`===== BangDice   指令帮助 =====
.coc[n]     生成人物卡
.ra 关键字   属性检定
.rt 技能±数  探索检定
.st 面板录入 或 整卡录入
.nn 名称     绑定角色名
.show       查看角色面板
.r 表达式    骰点表达式
========= 溢出功能 =========
${pluginCmdTable.map(p => p.names.join("/")).join("、")}`);
    return;
  }

  if (bot.dispatchPlugin(text, e, ws, sendGroupMsg)) return;

  if (text.startsWith(".coc")) handleCocCard(e, ws, text.slice(4).trim());
  else if (text.startsWith(".ra")) handleRa(e, ws, text.slice(3).trim());
  else if (text.startsWith(".rt")) handleRt(e, ws, text.slice(3).trim());
  else if (text.startsWith(".st")) handleSt(e, ws, text.slice(3).trim());
  else if (text.startsWith(".nn")) handleNn(e, ws, text.slice(3).trim());
  else if (text.startsWith(".r")) handleR(e, ws, text.slice(2).trim());
  else if (text.startsWith(".show")) handleShow(e, ws);
});


function handleRa(e, ws, arg) {
  const p = getPlayer(e.user_id);
  const key = arg.trim();
  const target = isFinite(key) ? Number(key) : p.attrs[key];
  if (!target) return sendGroupMsg(ws, e.group_id, `未找到属性 ${key}`);
  const d = Math.floor(Math.random()*100)+1;
  const { successRank } = resultCheck(0, d, target, 1);
  sendGroupMsg(ws, e.group_id, renderKey(tpl, successRankToKey(successRank), { 玩家:p.name||e.sender.nickname, 出目:d, 判定值:target, 属性:key }));
}

function handleRt(e, ws, arg) {
  const p = getPlayer(e.user_id);
  const s = arg.match(/([^\d]+)(-?\d+)?/);
  const n = s ? (s[1]||"").trim() : "";
  const b = s && s[2] ? parseInt(s[2]) : 0;
  if (!n || !p.attrs[n]) return sendGroupMsg(ws, e.group_id, `未找到技能 ${n}`);
  const d = Math.floor(Math.random()*100)+1;
  const { successRank } = resultCheck(3, d, p.attrs[n], 1, { skillBonus:b });
  sendGroupMsg(ws, e.group_id, renderKey(tpl, successRankToKey(successRank), { 玩家:p.name||e.sender.nickname, 出目:d, 判定值:p.attrs[n]+b, 属性:n }));
}

function handleSt(e, ws, arg) {
  const p = getPlayer(e.user_id);
  const pairs = arg.match(/([^\d]+)(\d+)/g);
  if (!pairs) { sendGroupMsg(ws, e.group_id, "未识别任何属性/技能"); return; }
  const map = {力量:"力量",str:"力量",敏捷:"敏捷",dex:"敏捷",意志:"意志",pow:"意志",体质:"体质",con:"体质",外貌:"外貌",app:"外貌",教育:"教育",edu:"教育",体型:"体型",siz:"体型",智力:"智力",int:"智力",灵感:"智力",幸运:"幸运",运气:"幸运",luck:"幸运",san:"理智",理智:"理智",理智值:"理智",hp:"体力",体力:"体力",mp:"魔法",魔法:"魔法",db:"伤害加值",伤害加值:"伤害加值"};
  for (const pair of pairs) {
    const m = pair.match(/([^\d]+)(\d+)/);
    if (!m) continue;
    let key = m[1].trim().toLowerCase();
    let val = Number(m[2]);
    if (map[key]) key = map[key];
    p.attrs[key] = val;
  }
  savePlayers();
  sendGroupMsg(ws, e.group_id, "面板已录入");
}

function handleNn(e, ws, arg) {
  const n = arg.trim();
  if (!n) return sendGroupMsg(ws, e.group_id, "格式错误");
  getPlayer(e.user_id).name = n;
  savePlayers();
  sendGroupMsg(ws, e.group_id, `已绑定角色：${n}`);
}

function handleR(e, ws, arg) {
  const val = rollExpr(arg);
  if (val == null) return sendGroupMsg(ws, e.group_id, "表达式错误");
  sendGroupMsg(ws, e.group_id, `${arg} = ${val}`);
}

function handleShow(e, ws) {
  const p = getPlayer(e.user_id);
  sendGroupMsg(ws, e.group_id, `角色名: ${p.name||"未设置"}\n属性: ${JSON.stringify(p.attrs)}`);
}

function handleCocCard(e, ws, arg) {
  const p = getPlayer(e.user_id);
  let count = Math.min(parseInt(arg)||1, 5);
  const names=["壹","贰","叁","肆","伍"];
  const res=[];
  for(let i=0;i<count;i++){
    const a={力量:"3d6*5",敏捷:"3d6*5",意志:"3d6*5",体质:"3d6*5",外貌:"3d6*5",教育:"(2d6+6)*5",体型:"(2d6+6)*5",智力:"(2d6+6)*5",幸运:"3d6*5"};
    const v={};
    for(const k in a){ v[k]=Math.floor(rollExpr(a[k])); }
    const hp=Math.floor((v["体质"]+v["体型"])/10);
    const s=v["力量"]+v["体型"];
    const db = s<65?"-2":s<85?"-1":s<125?"0":s<165?"1d4":"1d6";
    res.push(`【${names[i]}】 力量:${v["力量"]} 敏捷:${v["敏捷"]} 意志:${v["意志"]} 体质:${v["体质"]} 外貌:${v["外貌"]} 教育:${v["教育"]} 体型:${v["体型"]} 智力:${v["智力"]} 幸运:${v["幸运"]} HP:${hp} DB:${db}`);
  }
  sendGroupMsg(ws, e.group_id, `「${p.name||"玩家"}」:\n`+res.join("\n------\n"));
}
