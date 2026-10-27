// トーストの置き場のウィジェット: 根に置き、出しているトーストを画面の下の真ん中に描く
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { ToastHost } from "./ToastHost"

export const TOAST_HOST = defineWidget({ id: kit.name("toast-host"), slots: ["root"], view: ToastHost })
