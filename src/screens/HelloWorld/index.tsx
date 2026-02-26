import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { HelloWorldData } from './scenarios'

export default function HelloWorldScreen({ data }: { data: HelloWorldData }) {
  const { isLoading, items, lang } = data
  const { t, i18n } = useTranslation('helloWorld')

  useEffect(() => {
    i18n.changeLanguage(lang)
  }, [lang, i18n])

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-4">
      <h1 className="text-4xl font-bold tracking-tight">{t('title')}</h1>

      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button>{t('getStarted')}</Button>
        </CardContent>
      </Card>

      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('itemsTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span>{t('loadingMessage')}</span>
            </div>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground">{t('emptyMessage')}</p>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.id} className="rounded-md border px-3 py-2">
                  <div className="font-medium">{item.title}</div>
                  <div className="text-sm text-muted-foreground">{item.subtitle}</div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
