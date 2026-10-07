'use client'

import { useState, use } from 'react'
import { useLoad } from '@/lib/useLoad'
import PageHeader from '@/components/PageHeader'
import type { LabConfig, IPMapping, DeviceType } from '@/lib/types'

type Event = {
  _id: string
  domain: string
  client_ip: string
  ap_ip: string
  ap_name: string
  timestamp: string
  detected: boolean
  group?: string
}

type PageProps = {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ device?: string }>
}

export default function LabPage({ params }: PageProps) {
  const resolvedParams = use(params)
  const labId = resolvedParams.id
  const [lab, setLab] = useState<LabConfig | null>(null)
  const [mappings, setMappings] = useState<IPMapping[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ total: 0, threats: 0, clients: 0 })


  const fetchData = async () => {
    try {
      const [labRes, mappingsRes, eventsRes] = await Promise.all([
        fetch(`/api/lab-config`),
        fetch(`/api/ip-mappings?lab_id=${labId}`),
        fetch('/api/events?limit=500')
      ])
      
      const labsData = await labRes.json()
      const currentLab = labsData.find((l: LabConfig) => l.id === labId)
      setLab(currentLab || null)
      
      const mappingsData = await mappingsRes.json()
      setMappings(mappingsData)
      
      const eventsData: Event[] = await eventsRes.json()
      
      // Filter events by lab IP mappings
      const labIPs = mappingsData.map((m: IPMapping) => m.client_ip)
      const filtered = eventsData.filter(e => labIPs.includes(e.client_ip))
      
      setEvents(filtered)
      
      // Calculate stats
      const threats = filtered.filter(e => e.detected).length
      const uniqueClients = new Set(filtered.map(e => e.client_ip)).size
      setStats({ total: filtered.length, threats, clients: uniqueClients })
    } catch (error) {
      console.error('Failed to fetch:', error)
    } finally {
      setLoading(false)
    }
  }

  useLoad(fetchData, 10000, labId)

  const getDeviceIcon = (deviceType: DeviceType) => {
    switch (deviceType) {
      case 'AP':
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
          </svg>
        )
      case 'Server':
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
          </svg>
        )
      default:
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        )
    }
  }

  const getDeviceSummary = () => {
    const byType = mappings.reduce((acc, m) => {
      acc[m.device_type] = (acc[m.device_type] || 0) + 1
      return acc
    }, {} as Record<DeviceType, number>)
    return byType
  }

  const recentEvents = events.slice(0, 30)

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-line border-t-blue-500 rounded-full animate-spin"></div>
      </div>
    )
  }

  if (!lab) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-chalk mb-2">Lab Not Found</h1>
          <p className="text-chalk-faint">No lab exists with that ID</p>
        </div>
      </div>
    )
  }

  const deviceSummary = getDeviceSummary()

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        crumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Lab Monitoring', href: '/labs/all' }, { label: lab.name }]}
        title={lab.name}
        description={lab.description || undefined}
        actions={
          <button onClick={fetchData} disabled={loading} className="btn btn-primary w-full sm:w-auto">
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        }
      >
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-chalk-faint">
          <span className="inline-block px-2 py-0.5 bg-primary-light text-primary rounded text-xs font-medium">
            {lab.network_type || 'Lab'}
          </span>
          <span className="font-mono">{lab.ap_ip}</span>
          <span>{mappings.length} {mappings.length === 1 ? 'device' : 'devices'}</span>
        </div>
      </PageHeader>

      <div className="page-x py-6 md:py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-surface rounded-xl border border-line p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="text-sm text-chalk-faint font-medium">Total Queries</span>
            </div>
            <div className="text-2xl md:text-3xl font-bold text-chalk">{stats.total.toLocaleString('en-GB')}</div>
          </div>

          <div className="bg-surface rounded-xl border border-line p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-flag/10 rounded-lg">
                <svg className="w-5 h-5 text-flag" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <span className="text-sm text-chalk-faint font-medium">Threats Blocked</span>
            </div>
            <div className="text-2xl md:text-3xl font-bold text-chalk">{stats.threats.toLocaleString('en-GB')}</div>
          </div>

          <div className="bg-surface rounded-xl border border-line p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-safe/10 rounded-lg">
                <svg className="w-5 h-5 text-safe" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <span className="text-sm text-chalk-faint font-medium">Active Clients</span>
            </div>
            <div className="text-2xl md:text-3xl font-bold text-chalk">{stats.clients.toLocaleString('en-GB')}</div>
          </div>

          <div className="bg-surface rounded-xl border border-line p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-surface-3 rounded-lg">
                <svg className="w-5 h-5 text-chalk-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                </svg>
              </div>
              <span className="text-sm text-chalk-faint font-medium">Total Devices</span>
            </div>
            <div className="text-2xl md:text-3xl font-bold text-chalk">{mappings.length}</div>
          </div>
        </div>

        {/* Device Summary */}
        {mappings.length > 0 && (
          <div className="bg-surface rounded-xl border border-line p-6 mb-6">
            <h2 className="text-lg font-semibold text-chalk mb-4">Device Summary</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
              {Object.entries(deviceSummary).map(([type, count]) => (
                <div key={type} className="flex items-center gap-3 p-3 bg-background rounded-lg">
                  <div className="text-primary">
                    {getDeviceIcon(type as DeviceType)}
                  </div>
                  <div>
                    <div className="text-xs text-chalk-faint">{type}</div>
                    <div className="text-lg font-semibold text-chalk">{count}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Devices Grid */}
        {mappings.length > 0 && (
          <div className="bg-surface rounded-xl border border-line mb-6">
            <div className="border-b border-line px-4 md:px-6 py-4">
              <h2 className="text-lg font-semibold text-chalk">Devices</h2>
            </div>
            <div className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {mappings
                .sort((a, b) => a.seat - b.seat)
                .map(mapping => (
                  <div
                    key={mapping.id}
                    className="p-4 bg-background rounded-lg border border-line hover:border-primary/50 transition-all"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="text-primary">
                          {getDeviceIcon(mapping.device_type)}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-chalk">{mapping.label}</div>
                          <div className="text-xs text-chalk-faint">{mapping.device_type}</div>
                        </div>
                      </div>
                      <span className="w-2 h-2 rounded-full bg-safe"></span>
                    </div>
                    <div className="text-xs font-mono text-chalk-dim mb-2">{mapping.client_ip}</div>
                    {mapping.description && (
                      <div className="text-xs text-chalk-faint line-clamp-2">{mapping.description}</div>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Activity Table */}
        <div className="bg-surface rounded-xl border border-line">
          <div className="border-b border-line px-4 md:px-6 py-4">
            <h2 className="text-lg font-semibold text-chalk">Recent Activity</h2>
          </div>
          
          <div className="overflow-x-auto">
            {recentEvents.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-surface-3 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-chalk-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                </div>
                <p className="text-chalk-faint">No activity in this lab</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-background border-b border-line">
                  <tr>
                    <th className="px-4 md:px-6 py-4 text-left text-xs font-semibold text-chalk-dim uppercase tracking-wider">Status</th>
                    <th className="px-4 md:px-6 py-4 text-left text-xs font-semibold text-chalk-dim uppercase tracking-wider">Domain</th>
                    <th className="px-4 md:px-6 py-4 text-left text-xs font-semibold text-chalk-dim uppercase tracking-wider">Client IP</th>
                    <th className="px-4 md:px-6 py-4 text-left text-xs font-semibold text-chalk-dim uppercase tracking-wider">Time</th>
                    <th className="px-4 md:px-6 py-4 text-left text-xs font-semibold text-chalk-dim uppercase tracking-wider">Category</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {recentEvents.map((event) => {
                    const mapping = mappings.find(m => m.client_ip === event.client_ip)
                    return (
                      <tr key={event._id} className="hover:bg-surface-2 transition-colors">
                        <td className="px-4 md:px-6 py-4 whitespace-nowrap">
                          {event.detected ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-flag/10 text-flag rounded-lg text-xs font-medium border border-flag/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-flag"></span>
                              Blocked
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-safe/10 text-safe rounded-lg text-xs font-medium border border-safe/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-safe"></span>
                              Allowed
                            </span>
                          )}
                        </td>
                        <td className="px-4 md:px-6 py-4">
                          <span className="text-sm text-chalk font-medium break-all">{event.domain}</span>
                        </td>
                        <td className="px-4 md:px-6 py-4 whitespace-nowrap">
                          <div>
                            <span className="text-sm text-chalk-dim font-mono">{event.client_ip}</span>
                            {mapping && (
                              <div className="text-xs text-chalk-faint mt-0.5">{mapping.label}</div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 md:px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-chalk-faint">
                            {new Date(event.timestamp).toLocaleTimeString('en-GB')}
                          </span>
                        </td>
                        <td className="px-4 md:px-6 py-4 whitespace-nowrap">
                          {event.group && (
                            <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded border border-primary/20">
                              {event.group}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
