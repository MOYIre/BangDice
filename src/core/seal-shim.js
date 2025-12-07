import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const storeDir = path.join(__dirname, "../roles/Plugins/storage")
if (!fs.existsSync(storeDir)) fs.mkdirSync(storeDir, { recursive: true })

function load(key) {
  const file = path.join(storeDir, key + ".json")
  if (!fs.existsSync(file)) return null
  try { return fs.readFileSync(file, "utf8") } catch { return null }
}
function save(key, val) {
  const file = path.join(storeDir, key + ".json")
  fs.writeFileSync(file, val, "utf8")
}

const extList = []

const seal = {
  ext: {
    find(name) {
      return extList.find(e => e.name === name)
    },
    new(name, author, version) {
      return {
        name, author, version,
        cmdMap: {},

        storageGet(key) { return load(name + "_" + key) },
        storageSet(key, val) { save(name + "_" + key, val) }
      }
    },
    register(ext) {
      if (!extList.includes(ext)) extList.push(ext)
    },

    newCmdItemInfo() {
      return { name: "", help: "", solve: () => {} }
    },

    newCmdExecuteResult(success = true) {
      return { success, showHelp: false }
    }
  },

  replyToSender(ctx, msg, content) {
    ctx.send(content)
  }
}

export { seal, extList }
export default seal
