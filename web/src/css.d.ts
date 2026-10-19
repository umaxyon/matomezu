// CSS の import の型。CSS Modules はクラス名の表を返す
declare module "*.module.css" {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}
declare module "*.css";
