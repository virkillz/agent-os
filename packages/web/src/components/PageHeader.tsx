import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

interface PageHeaderProps {
  title: string
  subtitle: string
  backTo: string
}

export default function PageHeader({ title, subtitle, backTo }: PageHeaderProps) {
  const navigate = useNavigate()

  return (
    <div className="flex items-center gap-4">
      <button
        onClick={() => navigate(backTo)}
        className="group flex items-center justify-center w-12 h-12 rounded-xl mb-6 transition-all duration-300"
        style={{
          background: 'rgb(var(--s1) / 0.5)',
          border: '1px solid rgb(var(--accent) / 0.12)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgb(var(--s2) / 0.6)'
          e.currentTarget.style.borderColor = 'rgb(var(--accent) / 0.4)'
          e.currentTarget.style.transform = 'translateX(-2px)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgb(var(--s1) / 0.5)'
          e.currentTarget.style.borderColor = 'rgb(var(--accent) / 0.12)'
          e.currentTarget.style.transform = 'translateX(0)'
        }}
      >
        <ArrowLeft
          size={24}
          style={{ color: 'rgb(var(--accent) / 0.8)' }}
        />
      </button>

      <div className="mb-6">
        <h1
          className="text-lg font-bold tracking-[0.15em] uppercase"
          style={{ color: 'var(--text-primary)' }}
        >
          {title}
        </h1>
        <p className="text-xs mt-1.5 tracking-wider uppercase" style={{ color: 'var(--muted)' }}>
          {subtitle}
        </p>
      </div>
    </div>
  )
}
