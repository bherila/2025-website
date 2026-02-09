import cn from 'classnames'
import type { ReactNode } from 'react'

import CustomLink from '@/components/link'
import { ModalImage } from '@/components/modal-image'

export default function ImageAndText({
  children,
  imageUrl,
  alt,
  ctaText,
  ctaLink,
  extraClass,
  title,
  date,
}: ImageAndTextProps) {
  return (
    <div className={cn('flex flex-wrap pb-4', extraClass)}>
      <div className="sm:w-1/3 md:w-1/3 lg:w-1/4">
        <ModalImage imageUrl={imageUrl} alt={alt} {...(title ? { title } : {})} />
      </div>
      <div className="sm:w-2/3 md:w-2/3 lg:w-3/4 pl-6">
        {title && <h2 className="text-2xl font-bold mt-2 mb-2">{title}</h2>}
        {date && <p className="text-muted-foreground">{date}</p>}
        {children}
        {ctaText && ctaLink ? (
          <CustomLink href={ctaLink} className="mt-3 block">
            {ctaText}
          </CustomLink>
        ) : null}
      </div>
    </div>
  )
}

interface ImageAndTextProps {
  children: ReactNode
  imageUrl: string
  alt: string
  ctaText?: string
  ctaLink?: string
  extraClass?: string
  title?: string
  date?: string
}