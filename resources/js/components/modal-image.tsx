'use client'

import { useState } from 'react'

import { Dialog, DialogContent, DialogHeader,DialogTitle, DialogTrigger } from '@/components/ui/dialog'

interface ModalImageProps {
  imageUrl: string
  alt: string
  title?: string
}

export function ModalImage({ imageUrl, alt, title }: ModalImageProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <img width="100%" src={imageUrl} alt={alt} className="cursor-pointer" onClick={() => setIsOpen(true)} />
      </DialogTrigger>
      <DialogContent className="max-w-screen-lg max-h-screen-lg overflow-hidden p-0">
        {title && (
          <DialogHeader className="absolute top-4 left-4 z-10">
            <DialogTitle className="text-white text-2xl font-bold drop-shadow-lg">{title}</DialogTitle>
          </DialogHeader>
        )}
        <img
          src={imageUrl}
          alt={alt}
          className="w-full h-full object-contain cursor-pointer"
          onClick={() => setIsOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}