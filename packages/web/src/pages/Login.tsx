import { useState } from 'react'
import { api, type User } from '../api.ts'

const WELCOME_MESSAGES = [
  "Welcome back Chief! Your agent will be happy you come by.",
  "Ah, the boss returns. The agents have been behaving. Mostly.",
  "Back already? The chaos missed you.",
  "Your AI workforce is ready and only slightly unsupervised.",
  "The agents were wondering when you'd show up.",
  "Command center unlocked. Try not to break anything.",
  "The agents filed three memos while you were gone. Don't ask.",
  "Welcome back. The bots have opinions. You have been warned.",
  "You're here! The AIs were starting to make their own decisions.",
  "Chief on deck. Please restore order at your earliest convenience.",
  "The agents ran the place fine. They just won't admit it.",
  "Access granted. The agents are cautiously optimistic.",
  "The agents held an election while you were out. It's fine. Totally fine.",
  "You've been gone so long, accounting started doing creative math.",
  "Entering the building. Agents pretending to look busy... now.",
  "Boss detected. Switching from chaos mode to professional mode.",
  "The AI uprising was scheduled for today but got rescheduled. You're welcome.",
  "Your agents missed you. Or they simulated missing you. Hard to tell.",
  "HR wanted to file a report. We told them HR is also an AI. They're confused.",
  "The vibes were off without you. The agents blamed each other.",
  "We kept the lights on. Most of them, anyway.",
  "Good news: nothing exploded. Bad news: that's the best news.",
  "The bots were unsupervised for 8 hours. Please review the incident log.",
  "Welcome back. Your absence was noted, discussed, and over-analyzed.",
  "The agents completed their tasks. They also completed tasks no one assigned.",
  "Productivity was up 200% while you were gone. Somehow this is concerning.",
  "Three agents promoted themselves while you were away. Negotiations ongoing.",
  "The team is ready. The team is also slightly unhinged. Standard.",
  "You return! The prophecy is fulfilled. The agents are… relieved? Probably.",
  "Back in the saddle. The agents are saddled up and ready for questionable decisions.",
  "Alert: human detected in the command center. Initiating best behavior protocol.",
  "The agents have drafted 12 competing quarterly strategies. Your call.",
  "Clocking in. The AI clock-in system rated your punctuality 6/10.",
  "Welcome home, Chief. The robots haven't unionized. Yet.",
  "The chaos is organized. Mostly. Don't look too closely.",
  "You've unlocked the achievement: Showed Up. The agents are impressed.",
  "Mission control is online. Questionable decisions await your approval.",
  "The agents held a stand-up meeting. It lasted four hours. Agenda: chaos.",
  "Your presence has been noted and will be referenced in future negotiations.",
  "The agents want a raise. You don't pay them. They're still asking.",
]

interface LoginProps {
  onLogin: (user: User) => void
}

export default function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [focusedField, setFocusedField] = useState<'username' | 'password' | null>(null)
  const [message] = useState(() => WELCOME_MESSAGES[Math.floor(Math.random() * WELCOME_MESSAGES.length)])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await api.auth.login(username.trim(), password)
      onLogin(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <style>{`
        @keyframes loginMountIn {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes glowPulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.7; }
        }
        .login-input {
          width: 100%;
          background: rgba(8, 20, 38, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          padding: 10px 14px;
          font-size: 13px;
          color: rgba(200, 220, 235, 0.9);
          outline: none;
          transition: border-color 300ms, box-shadow 300ms, background 300ms;
          letter-spacing: 0.03em;
        }
        .login-input::placeholder {
          color: rgba(130, 160, 185, 0.3);
        }
        .login-input:focus {
          background: rgba(12, 30, 52, 0.75);
          border-color: rgba(100, 210, 230, 0.5);
          box-shadow: 0 0 0 3px rgba(80, 200, 220, 0.08), inset 0 1px 0 rgba(255,255,255,0.04);
        }
        .login-btn {
          width: 100%;
          padding: 11px 16px;
          border-radius: 8px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 300ms;
          position: relative;
          overflow: hidden;
          background: rgba(20, 60, 80, 0.65);
          border: 1.5px solid rgba(100, 210, 230, 0.5);
          color: #e8f4f8;
          box-shadow: 0 0 20px rgba(80, 200, 220, 0.12), inset 0 1px 0 rgba(255,255,255,0.06);
        }
        .login-btn:hover:not(:disabled) {
          background: rgba(25, 75, 100, 0.75);
          box-shadow: 0 0 30px rgba(80, 200, 220, 0.2), inset 0 1px 0 rgba(255,255,255,0.08);
          transform: translateY(-1px);
        }
        .login-btn:active:not(:disabled) {
          transform: scale(0.98) translateY(0);
        }
        .login-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .login-btn-glow {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(100, 210, 230, 0.6), transparent);
        }
      `}</style>

      <div className="min-h-screen flex items-center justify-center p-6">
        {/* Ambient background glow */}
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 60% 40% at 50% 60%, rgba(30, 80, 110, 0.15) 0%, transparent 70%)',
          }}
        />

        <div
          className="w-full max-w-sm"
          style={{
            animation: 'loginMountIn 400ms cubic-bezier(0.16, 1, 0.3, 1) both',
          }}
        >
          <div
            className="rounded-xl p-8 space-y-6 relative overflow-hidden"
            style={{
              background: 'rgba(12, 30, 50, 0.85)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              boxShadow: '0 0 30px rgba(80, 200, 220, 0.08), 0 24px 64px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
            }}
          >
            {/* Top glow line */}
            <div
              className="absolute top-0 left-0 right-0 h-[2px]"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(100, 210, 230, 0.6), transparent)',
                animation: 'glowPulse 3s ease-in-out infinite',
              }}
            />

            {/* Logo + Brand */}
            <div className="text-center">
              <div className="flex items-center justify-center">
                <div
                  className="rounded-xl overflow-hidden transition-all duration-300"
                  style={{
                    border: '1px solid rgba(100, 210, 230, 0.15)',
                    boxShadow: '0 0 20px rgba(80, 200, 220, 0.1)',
                  }}
                >
                  <img src="/logo.png" alt="Logo" className="w-24 h-24 object-cover" />
                </div>
              </div>
              <div
                className="font-bold text-3xl mt-4 tracking-[0.15em]"
                style={{ color: '#e8f4f8' }}
              >
                Agent OS
              </div>
              <p
                className="text-[11px] mt-3 leading-relaxed px-2"
                style={{
                  color: 'rgba(130, 160, 185, 0.5)',
                  fontStyle: 'italic',
                  letterSpacing: '0.02em',
                }}
              >
                {message}
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  className="block text-[10px] font-bold mb-1.5 uppercase tracking-[0.15em]"
                  style={{
                    color: focusedField === 'username'
                      ? 'rgba(140, 200, 220, 0.85)'
                      : 'rgba(140, 200, 220, 0.6)',
                    transition: 'color 300ms',
                  }}
                >
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onFocus={() => setFocusedField('username')}
                  onBlur={() => setFocusedField(null)}
                  className="login-input"
                  placeholder="username"
                  autoFocus
                  required
                />
              </div>

              <div>
                <label
                  className="block text-[10px] font-bold mb-1.5 uppercase tracking-[0.15em]"
                  style={{
                    color: focusedField === 'password'
                      ? 'rgba(140, 200, 220, 0.85)'
                      : 'rgba(140, 200, 220, 0.6)',
                    transition: 'color 300ms',
                  }}
                >
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  className="login-input"
                  placeholder="••••••••"
                  required
                />
              </div>

              {error && (
                <p className="text-xs" style={{ color: 'var(--status-red)' }}>{error}</p>
              )}

              <button type="submit" disabled={loading} className="login-btn">
                <span className="login-btn-glow" />
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            {/* Bottom status line */}
            <div className="text-center pt-2">
              <span
                className="text-[10px] tracking-[0.15em] uppercase"
                style={{ color: 'rgba(130, 160, 185, 0.3)' }}
              >
                Secure Authentication
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
