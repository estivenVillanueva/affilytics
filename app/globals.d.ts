declare module "*.css";

declare namespace JSX {
  interface IntrinsicElements {
    // Polaris web component: no upstream TS types in this template
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    "s-app-nav": any;
  }
}
