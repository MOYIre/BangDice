import fs from "fs";
import yaml from "js-yaml";
import path from "path";

const TEMPLATE_PATH = path.join(process.cwd(), "roles", "text-template.yaml");

export function loadTemplates() {
  if (!fs.existsSync(TEMPLATE_PATH)) return {};
  const raw = fs.readFileSync(TEMPLATE_PATH, "utf8");
  const data = yaml.load(raw);
  return data || {};
}

function pickOne(arr) {
  if (!Array.isArray(arr)) return null;
  const flat = arr.map(it => Array.isArray(it) && it.length >= 1 ? { text: it[0], weight: Number(it[1] ?? 1) } : null).filter(Boolean);
  if (!flat.length) return null;
  let total = flat.reduce((s,e)=>s+(e.weight||1),0);
  let r = Math.random()*total;
  for (const e of flat) { r-=e.weight; if(r<=0) return e.text; }
  return flat[flat.length-1].text;
}

export function renderKey(templates, key, ctx={}) {
  const tplRoot = templates?.COC || templates;
  const entry = tplRoot?.[key]; if(!entry) return "";
  let tpl = pickOne(entry); if(!tpl) return "";
  return tpl.replace(/\{\$t([^\}]+)\}/g, (_,v)=>ctx[v]??"")
            .replace(/\{\$([^\}]+)\}/g, (_,v)=>ctx[v]??"");
}
