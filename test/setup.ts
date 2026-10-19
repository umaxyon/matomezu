// bun test で DOM を使えるようにする（happy-dom）
import { GlobalRegistrator } from "@happy-dom/global-registrator"

GlobalRegistrator.register()
