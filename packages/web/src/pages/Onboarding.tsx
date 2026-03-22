import { useState } from 'react'
import { api, type Provider, type User } from '../api.ts'
import { useStore } from '../store.ts'


type Step = 'company' | 'provider' | 'account'

interface OnboardingProps {
  onComplete: (user?: User) => void
}

export default function Onboarding({ onComplete, startAtAccount }: OnboardingProps & { startAtAccount?: boolean }) {
  const { settings } = useStore()
  const [step, setStep] = useState<Step>(startAtAccount ? 'account' : 'company')
  const [companyName, setCompanyName] = useState(startAtAccount ? (settings?.companyName ?? '') : 'Rascal Inc')
  const [companyMission, setCompanyMission] = useState('A highly questionable organization run entirely by AI agents with just enough intelligence to be dangerous and just enough mischief to make it interesting.')
  const [providers, setProviders] = useState<Provider[]>([])
  const [selectedProvider, setSelectedProvider] = useState<string>('openrouter')
  const [apiKey, setApiKey] = useState('')
  const [adminUsername, setAdminUsername] = useState('chief')
  const [adminDisplayName, setAdminDisplayName] = useState('Chief Rascal')
  const [adminPassword, setAdminPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const { updateSettings } = useStore()

  async function handleCompanyContinue() {
    if (!companyName.trim()) { setError('Company name is required'); return }
    setSaving(true)
    setError('')
    try {
      await updateSettings({ companyName: companyName.trim(), companyMission: companyMission.trim() })
      const list = await api.settings.providers()
      setProviders(list)
      setStep('provider')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveProvider() {
    if (!apiKey.trim()) { setError('API key required'); return }
    setSaving(true)
    setError('')
    try {
      await api.settings.saveProviderKey(selectedProvider, apiKey.trim())
      setStep('account')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateAccount() {
    if (!adminUsername.trim()) { setError('Username required'); return }
    if (!adminDisplayName.trim()) { setError('Display name required'); return }
    if (!adminPassword) { setError('Password required'); return }
    setSaving(true)
    setError('')
    try {
      await api.auth.setup({
        username: adminUsername.trim(),
        displayName: adminDisplayName.trim(),
        password: adminPassword,
        companyName: companyName.trim(),
      })
      const user = await api.auth.login(adminUsername.trim(), adminPassword)
      onComplete(user)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  const recommended = providers.find((p) => p.recommended)
  const others = providers.filter((p) => !p.recommended)

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md relative">
        <div className="card p-8 space-y-6">
        {/* Logo */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-2">
            <img src="/logo.png" alt="Rascal Inc" className="w-36 h-36 rounded-lg object-cover" />
          </div>
          <div className="text-white font-semibold text-lg">Rascal-Inc</div>
          <p className="text-muted text-sm">virtual company platform</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2">
          {(['company', 'provider', 'account'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <button
                className={`w-2.5 h-2.5 rounded-full transition-all ${
                  s === step
                    ? 'bg-accent scale-110'
                    : steps_done(s, step)
                    ? 'bg-accent/40 hover:bg-accent/70 cursor-pointer'
                    : 'bg-white/20 cursor-default'
                }`}
                onClick={() => { if (steps_done(s, step)) { setError(''); setStep(s) } }}
                disabled={!steps_done(s, step)}
                aria-label={`Go to ${s} step`}
              />
              {i < 2 && <div className="w-6 h-px bg-white/20" />}
            </div>
          ))}
        </div>

        {/* ── Step 1: Company ── */}
        {step === 'company' && (
          <div className="space-y-5">
            <div>
              <h1 className="text-xl font-semibold text-white">Let's setup your virtual company!</h1>
              <p className="text-sm text-muted mt-1">Give your virtual company a name and purpose.</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-subtle mb-1.5">Company name *</label>
                <input
                  className="input"
                  placeholder="Acme Corp"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCompanyContinue()}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-subtle mb-1.5">Mission <span className="text-muted font-normal">(optional)</span></label>
                <textarea
                  className="input resize-none h-20"
                  placeholder="What does your company do?"
                  value={companyMission}
                  onChange={(e) => setCompanyMission(e.target.value)}
                />
              </div>
            </div>

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <button className="btn-primary w-full" onClick={handleCompanyContinue} disabled={saving}>
              {saving ? 'Saving...' : 'Continue'}
            </button>
          </div>
        )}

        {/* ── Step 2: Provider ── */}
        {step === 'provider' && (
          <div className="space-y-5">
            <div>
              <h1 className="text-xl font-semibold text-white">Connect a provider</h1>
              <p className="text-sm text-muted mt-0.5">Your agents need an LLM provider to think.</p>
            </div>

            {recommended && (
              <button
                className={`w-full text-left bg-accent/10 border rounded-lg p-4 space-y-2 transition-colors ${
                  selectedProvider === recommended.id ? 'border-accent/60' : 'border-accent/20 hover:border-accent/40'
                }`}
                onClick={() => { setSelectedProvider(recommended.id); setApiKey('') }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded-full font-medium">Recommended</span>
                  <span className="text-sm font-medium text-white">{recommended.label}</span>
                </div>
                <p className="text-xs text-muted">One API key gives access to 240+ models from every major lab.</p>
                {selectedProvider === recommended.id && (
                  <input
                    className="input text-xs mt-1"
                    type="password"
                    autoComplete="off"
                    placeholder="sk-or-..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                  />
                )}
              </button>
            )}

            {/* Other providers */}
            <details className="group">
              <summary className="text-xs text-muted cursor-pointer hover:text-subtle list-none flex items-center gap-1 select-none">
                <span className="group-open:rotate-90 transition-transform">▶</span>
                Use a different provider
              </summary>
              <div className="mt-3 space-y-2">
                {others.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedProvider(p.id); setApiKey('') }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors border ${
                      selectedProvider === p.id
                        ? 'border-accent bg-accent/10 text-white'
                        : 'border-border bg-surface-2 text-subtle hover:text-white'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
                {selectedProvider !== 'openrouter' && (
                  <input
                    className="input text-xs mt-2"
                    type="password"
                    autoComplete="off"
                    placeholder="API key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    autoFocus
                  />
                )}
              </div>
            </details>

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <div className="flex gap-2">
              <button
                className="btn-ghost flex-1 text-center"
                onClick={() => { setError(''); setStep('account') }}
              >
                Skip for now
              </button>
              <button className="btn-primary flex-1" onClick={handleSaveProvider} disabled={saving}>
                {saving ? 'Saving...' : 'Save & continue'}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Admin account ── */}
        {step === 'account' && (
          <div className="space-y-5">
            <div>
              <h1 className="text-xl font-semibold text-white">Create your account</h1>
              <p className="text-sm text-muted mt-0.5">You'll use this to log in as the platform admin.</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-subtle mb-1.5">Username *</label>
                <input
                  className="input"
                  placeholder="admin"
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-subtle mb-1.5">Display name *</label>
                <input
                  className="input"
                  placeholder="Your name"
                  value={adminDisplayName}
                  onChange={(e) => setAdminDisplayName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-subtle mb-1.5">Password *</label>
                <input
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Choose a password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateAccount()}
                  autoFocus
                />
              </div>
            </div>

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <button className="btn-primary w-full" onClick={handleCreateAccount} disabled={saving}>
              {saving ? 'Creating...' : 'Create account & continue'}
            </button>
          </div>
        )}


        </div>
      </div>
    </div>
  )
}

function steps_done(s: Step, current: Step): boolean {
  const order: Step[] = ['company', 'provider', 'account']
  return order.indexOf(s) < order.indexOf(current)
}
