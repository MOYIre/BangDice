// ==UserScript==
// @name       食灵
// @author      御铭茗
// @version     2.1.0
// @description 不知道吃什么问问若麦吧～
// @license     Apache-2
// ==/UserScript==

let ext = seal.ext.find('食灵');
if (!ext) {
  ext = seal.ext.new('食灵', '铭茗', '2.1.0');
  seal.ext.register(ext);
}

const defaultMenus = {
  breakfast: ["豆浆油条","包子","煎饼果子","鸡蛋灌饼","馄饨","面包牛奶","花卷","豆腐脑","烧饼夹肉","胡辣汤"],
  lunch: ["盖浇饭","炒面","麻辣香锅","米线","汉堡薯条","寿司","卤肉饭","酸辣粉","鸡排饭","咖喱饭"],
  dinner: ["火锅","烧烤","披萨","炸鸡啤酒","小炒","砂锅粥","红烧肉","水煮鱼","羊蝎子","烤鱼"],
  midnight: ["泡面","炸串","烧烤","凉皮","烤冷面","煎饺","关东煮","炒河粉","鸡翅","煎蛋炒饭"]
};

const masters = ["铭茗","若麦"];
const periodMap = {"早餐":"breakfast","早上":"breakfast","中午":"lunch","午餐":"lunch","晚上":"dinner","晚餐":"dinner","夜宵":"midnight"};
const periodNames = {breakfast:"早餐", lunch:"午餐", dinner:"晚餐", midnight:"夜宵"};
let extraPool = [];

const loadMenus = () => { 
  try { 
    const s = ext.storageGet("menus"); 
    return s ? JSON.parse(s) : JSON.parse(JSON.stringify(defaultMenus)); 
  } catch { 
    return JSON.parse(JSON.stringify(defaultMenus)); 
  } 
};
const saveMenus = m => ext.storageSet("menus", JSON.stringify(m));

const loadHistory = () => { try { const s = ext.storageGet("history"); return s ? JSON.parse(s) : { breakfast:[], lunch:[], dinner:[], midnight:[] }; } catch { return { breakfast:[], lunch:[], dinner:[], midnight:[] }; } };
const saveHistory = h => ext.storageSet("history", JSON.stringify(h));

const getPeriod = h => h>=5&&h<11?"breakfast":h>=11&&h<16?"lunch":h>=16&&h<22?"dinner":"midnight";

const randomFoodNoRepeat = (list, period) => {
  const hist = loadHistory();
  const combined = period !== "breakfast" ? [...list, ...extraPool] : list;
  let available = combined.filter(d => !hist[period].includes(d));
  if (!available.length) { hist[period] = []; available = [...combined]; }
  const choice = available[Math.floor(Math.random() * available.length)];
  hist[period].push(choice);
  saveHistory(hist);
  return choice;
};

const randomPrefix = p => `今日${p}${masters[Math.floor(Math.random()*masters.length)]}推荐: `;

const addDish = (menus, key, dishes) => {
  const added = [], skipped = [];
  if (key) {
    const p = periodMap[key]; if (!p) return `未知时段，请输入 早餐/中午/晚上/夜宵`;
    for (const d of dishes) {
      const dish = d.trim();
      if (menus[p].some(x => x.toLowerCase() === dish.toLowerCase())) skipped.push(dish);
      else { menus[p].push(dish); added.push(dish); }
    }
    saveMenus(menus);
    return added.length ? `已将 ${added.join("、")} 加入${key}菜单` : `没有新增菜品，已存在的: ${skipped.join("、")}`;
  } else {
    for (const d of dishes) {
      const dish = d.trim();
      if (extraPool.some(x => x.toLowerCase() === dish.toLowerCase())) skipped.push(dish);
      else { extraPool.push(dish); added.push(dish); }
    }
    return added.length ? `已将 ${added.join("、")} 加入通用食物池` : `没有新增菜品，已存在的: ${skipped.join("、")}`;
  }
};

const delDish = (menus, key, dishes) => {
  const removed = [], notFound = [];
  if (key) {
    const p = periodMap[key]; if (!p) return `未知时段，请输入 早餐/中午/晚上/夜宵`;
    for (const d of dishes) {
      const dish = d.trim().toLowerCase();
      const i = menus[p].findIndex(x => x.toLowerCase() === dish);
      if (i >= 0) removed.push(menus[p].splice(i,1)[0]); else notFound.push(d);
    }
    saveMenus(menus);
  } else {
    for (const d of dishes) {
      const dish = d.trim().toLowerCase();
      const i = extraPool.findIndex(x => x.toLowerCase() === dish);
      if (i >= 0) removed.push(extraPool.splice(i,1)[0]); else notFound.push(d);
    }
  }
  let msg = '';
  if (removed.length) msg += `已删除 ${removed.join("、")}${key?' 从'+key+'菜单':''}${(!key&&removed.length)?' 从通用食物池':''}\n`;
  if (notFound.length) msg += `未找到: ${notFound.join("、")}`;
  return msg || "操作完成";
};

const cmd = seal.ext.newCmdItemInfo();
cmd.name = "食灵";
cmd.help = `
食灵帮助：

.食灵 help  
显示本帮助  
-----------------------------------------
.食灵/饭笥 吃什么  
让若麦根据时间推荐  
.食灵/饭笥 [早餐/中午/晚上/夜宵]吃什么  
让若麦推荐指定时段  
-----------------------------------------
.食灵 加菜 [时段] 菜名1 [菜名2 ...]  
不指定时段则加到通用池  
.食灵 删菜 [时段] 菜名1 [菜名2 ...]  
不指定时段则从通用池删除  
-----------------------------------------
.食灵 菜单  
查看当前菜单  
.食灵/饭笥 随机菜单  
让若麦生成随机菜单  
.食灵 重置菜单  
重置所有菜单  
`;

cmd.solve = (ctx,msg,argv)=>{
  const res = seal.ext.newCmdExecuteResult(true);
  const menus = loadMenus();
  const textRaw = argv.args.join(" ").trim();
  const text = textRaw.replace(/^\.?食灵\s*/, '');

  const replyPeriod = p => seal.replyToSender(ctx,msg,randomPrefix(periodNames[p])+randomFoodNoRepeat(menus[p],p));

  if (!text || text==="help") res.showHelp = true;
  else if (text==="吃什么") replyPeriod(getPeriod(new Date().getHours()));
  else if (Object.keys(periodMap).some(k => text === k + "吃什么")) replyPeriod(periodMap[text.replace("吃什么","")]);
  else if (text.startsWith("加菜")) {
    const args = text.split(/\s+/).slice(1);
    const k = args.length>1 && periodMap[args[0]] ? args[0] : null;
    const dishes = k ? args.slice(1) : args;
    seal.replyToSender(ctx,msg,addDish(menus,k,dishes));
  }
  else if (text.startsWith("删菜")) {
    const args = text.split(/\s+/).slice(1);
    const k = args.length>1 && periodMap[args[0]] ? args[0] : null;
    const dishes = k ? args.slice(1) : args;
    seal.replyToSender(ctx,msg,delDish(menus,k,dishes));
  }
  else if (text==="菜单") {
    const arr = ["====== 食灵菜单 ======"];
    for (const [k,v] of Object.entries(menus)) arr.push(`${periodNames[k]}:\n  ${v.join("、")}`);
    if (extraPool.length) arr.push(`\n通用食物池:\n  ${extraPool.join("、")}`);
    arr.push("========================");
    seal.replyToSender(ctx,msg,arr.join("\n"));
  }
  else if (text==="随机菜单") {
    const out = Object.keys(menus).map(k=>randomPrefix(periodNames[k])+randomFoodNoRepeat(menus[k],k)).join("\n");
    seal.replyToSender(ctx,msg,"====== 随机菜单 ======\n"+out+"\n======================");
  }
  else if (text==="重置菜单") {
  saveMenus(JSON.parse(JSON.stringify(defaultMenus)));
  extraPool.length = 0;
  seal.replyToSender(ctx,msg,"菜单已重置为默认，通用食物池清空");
}

  else seal.replyToSender(ctx,msg,"未知命令，输入 .食灵 help 查看帮助");

  return res;
};

// 注册
ext.cmdMap["食灵"] = cmd;
ext.cmdMap["饭笥"] = cmd;