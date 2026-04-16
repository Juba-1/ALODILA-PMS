import { Component } from 'react'
import i18n from '../i18n/config.js'
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card'
import { Button } from './ui/Button'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const dir = i18n.language?.startsWith('en') ? 'ltr' : 'rtl'

    return (
      <div dir={dir} className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-xl">
          <Card>
            <CardHeader>
              <CardTitle>{i18n.t('errors.boundaryUnexpected')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-slate-500">{i18n.t('errors.boundaryHint')}</div>
              <pre className="mt-4 overflow-auto rounded-lg border border-slate-200 bg-slate-900 p-3 text-xs text-white">
                {String(this.state.error?.message || this.state.error || 'Unknown error')}
              </pre>
              <div className="mt-4 flex gap-3">
                <Button variant="primary" onClick={() => window.location.reload()}>
                  {i18n.t('errors.reload')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }
}
