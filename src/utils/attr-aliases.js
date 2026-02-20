/**
 * @file COC7 属性别名映射
 * 统一管理属性名称的别名，供核心模块和插件使用
 */

export const attrAliases = {
  // 运气/幸运相关
  '运势': '幸运',
  '运气': '幸运',
  'luck': '幸运',
  'LUCK': '幸运',
  
  // 力量相关
  'str': '力量',
  'STR': '力量',
  
  // 体质相关
  'con': '体质',
  'CON': '体质',
  
  // 体型相关
  'siz': '体型',
  'SIZ': '体型',
  
  // 敏捷相关
  'dex': '敏捷',
  'DEX': '敏捷',
  
  // 外貌相关
  'app': '外貌',
  'APP': '外貌',
  
  // 智力相关
  'int': '智力',
  'INT': '智力',
  
  // 意志相关
  'pow': '意志',
  'POW': '意志',
  
  // 教育相关
  'edu': '教育',
  'EDU': '教育',
  
  // 侦查相关
  '侦察': '侦查',
  '搜索': '侦查',
  'investigation': '侦查',
  'INV': '侦查',
  
  // 闪避相关
  '躲避': '闪避',
  'dodge': '闪避',
  
  // 其他常用别名
  '生命': '生命值',
  'hp': '生命值',
  'HP': '生命值',
  'san': '理智',
  'SAN': '理智',
  '克苏鲁': '克苏鲁神话',
  'cm': '克苏鲁神话',
  'CM': '克苏鲁神话',
  'mp': '魔法值',
  'MP': '魔法值',
};

/**
 * 标准化属性名称
 * @param {string} name - 原始属性名或别名
 * @returns {string} - 标准化的属性名
 */
export function normalizeAttrName(name) {
  return attrAliases[name] || attrAliases[name?.toLowerCase()] || name;
}

/**
 * 获取属性的标准名称（带大小写不敏感匹配）
 * @param {string} name - 原始属性名
 * @returns {string} - 标准属性名
 */
export function getStandardAttrName(name) {
  if (!name) return name;
  
  // 先尝试直接匹配
  if (attrAliases[name]) return attrAliases[name];
  
  // 再尝试小写匹配
  const lowerName = name.toLowerCase();
  for (const [alias, standard] of Object.entries(attrAliases)) {
    if (alias.toLowerCase() === lowerName) {
      return standard;
    }
  }
  
  return name;
}

export default attrAliases;
