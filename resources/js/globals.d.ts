// CSS module declarations
declare module '*.module.css' {
  const classes: { readonly [key: string]: string }
  export default classes
}

// CSS declarations
declare module '*.css' {
  const css: string
  export default css
}

// React responsive masonry declaration
declare module 'react-responsive-masonry' {
  import type { FC, ReactNode, CSSProperties } from 'react'

  interface MasonryProps {
    children: ReactNode
    columnsCount?: number
    gutter?: string
    className?: string | null
    style?: CSSProperties
    containerTag?: string
    itemTag?: string
    itemStyle?: CSSProperties
  }

  interface ResponsiveMasonryProps {
    children: ReactNode
    columnsCountBreakPoints?: { [breakpoint: number]: number }
    className?: string | null
    style?: CSSProperties | null
  }

  export const Masonry: FC<MasonryProps>
  export const ResponsiveMasonry: FC<ResponsiveMasonryProps>
  const ReactResponsiveMasonry: FC<ResponsiveMasonryProps>
  export default ReactResponsiveMasonry
}
