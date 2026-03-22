'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface ActionButtonProps {
  title: string
  subtitle: string
  destUrl: string
}

const actionButtons: ActionButtonProps[] = [
  {
    title: 'Work with me on a project',
    subtitle: "Learn about consulting opportunities with me. I'm not currently looking for a new full time role.",
    destUrl: '/projects',
  },
  {
    title: 'Get in touch',
    subtitle: 'Send me an email using my online contact form.',
    destUrl: '/contact',
  },
  {
    title: 'Cook with me',
    subtitle: 'Browse the selection of recipes that I have published here.',
    destUrl: '/recipes',
  },
]

export function CTAs() {
  return (
    <div className="mt-8">
      <h2 className="text-2xl font-bold mb-4">Want to...?</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {actionButtons.map((button) => (
          <a href={button.destUrl} key={button.title}>
            <Card className="h-full flex flex-col justify-between">
              <CardHeader>
                <CardTitle>{button.title}</CardTitle>
                <CardDescription>{button.subtitle}</CardDescription>
              </CardHeader>
              <CardContent>{/* Content can be added here if needed, but for now it's just a clickable card */}</CardContent>
            </Card>
          </a>
        ))}
      </div>
    </div>
  )
}