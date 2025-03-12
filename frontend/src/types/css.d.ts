declare module '*.css' {
    const content: { [className: string]: string }
    export default content
}

declare module '*.module.css' {
    const classes: { readonly [key: string]: string }
    export default classes
}
