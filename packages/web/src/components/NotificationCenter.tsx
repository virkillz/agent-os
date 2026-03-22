import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppEvents } from '../hooks/useAppEvents.ts'
import { useStore } from '../store.ts'
import type { Notification as AppNotification } from '../api.ts'

export default function NotificationCenter() {
  const {
    notifications, notificationsLoaded,
    loadNotifications, prependNotification,
    markAllNotificationsRead, loadSchedules,
  } = useStore()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!notificationsLoaded) loadNotifications()
  }, [notificationsLoaded, loadNotifications])

  useAppEvents((event) => {
    if (event.type === 'notification:created') {
      prependNotification({ ...(event.notification as unknown as AppNotification), is_read: false })
    } else if (event.type === 'schedule:created') {
      loadSchedules(event.agentId)
    }
  })

  useEffect(() => {
    if (!open) return
    function onClickOut(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOut)
    return () => document.removeEventListener('mousedown', onClickOut)
  }, [open])

  const unread = notifications.filter((n) => !n.is_read).length

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative w-7 h-7 rounded flex items-center justify-center transition-colors hover:bg-surface-3"
        style={{ color: 'var(--muted)' }}
        title="Notifications"
      >
        <BellIcon />
        {unread > 0 && (
          <span
            className="absolute top-0.5 right-0.5 w-3.5 h-3.5 text-white text-[9px] font-bold rounded-full flex items-center justify-center"
            style={{ background: 'rgb(var(--accent))' }}
          >
            {Math.min(unread, 9)}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-80 rounded-xl overflow-hidden z-50"
          style={{ background: 'rgb(16, 32, 60)', border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 12px 32px rgba(0,0,0,0.7)' }}
        >
          <div
            className="px-4 py-2.5 flex items-center justify-between"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
          >
            <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Notifications</span>
            {unread > 0 && (
              <button
                onClick={() => markAllNotificationsRead()}
                className="text-[10px] transition-colors"
                style={{ color: 'var(--muted)' }}
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-xs text-center py-6" style={{ color: 'var(--muted)' }}>No notifications</p>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className="px-4 py-2.5 flex items-start gap-2"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', opacity: n.is_read ? 0.5 : 1 }}
                >
                  {!n.is_read && (
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
                      style={{ background: 'rgb(var(--accent))' }}
                    />
                  )}
                  <div className={!n.is_read ? '' : 'pl-3.5'}>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{n.message}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--muted)' }}>
                      {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className="block text-center text-xs py-2.5 transition-colors hover:bg-white/5"
              style={{ color: 'rgb(var(--accent))' }}
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

function BellIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  )
}
