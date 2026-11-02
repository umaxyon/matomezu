// CSS と画像の import の型。CSS Modules はクラス名の表を、画像は配る所の URL を返す
declare module "*.module.css" {
  const classes: Readonly<Record<string, string>>
  export default classes
}
declare module "*.css"
declare module "*.png" {
  const url: string
  export default url
}
