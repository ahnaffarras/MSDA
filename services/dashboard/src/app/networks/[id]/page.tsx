'use client'

import { useState, use } from 'react'
import { useLoad } from '@/lib/useLoad'
import Link from 'next/link'
import PageHeader from '@/components/PageHeader'
import { formatDateTimeWIB, timeAgo } from '@/lib/format'
import type { Group, Node, DnsEvent } from '@/lib/types'

const ACTIVE_WINDOW_MS = 5 * 60 * 1000 // 5 menit
const REFRESH_MS = 30_000 // refresh tiap 30 detik

interface NodeWithClients extends Node {
  activeClientCount: number
  isOnline: boolean
  lastActivity: string
}

export default function NetworkDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const [group, setGroup] = useState<Group | null>(null)
  const [nodes, setNodes] = useState<NodeWithClients[]>([])
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => Date.now())

  const fetchData = async () => {
    try {
      const currentNow = Date.now()
      setNow(currentNow)

      // Fetch group info
      const groupRes = await fetch(`/api/groups?id=${resolvedParams.id}`)
      if (groupRes.ok) {
        const groupsData = await groupRes.json()
        const currentGroup = groupsData.find((g: Group) => g.id === resolvedParams.id)
        setGroup(currentGroup || null)
      }

      // Fetch nodes for this group
      const nodesRes = await fetch(`/api/nodes?group_id=${resolvedParams.id}`)
      if (nodesRes.ok) {
        const nodesData: Node[] = await nodesRes.json()
        
        // Fetch DNS events terbaru untuk deteksi aktivitas realtime
        const eventsRes = await fetch('/api/events?hours=24&limit=5000')
        const activeClientsByNode: Record<string, Set<string>> = {}
        const lastActivityByNode: Record<string, string> = {}
        
        if (eventsRes.ok) {
          const eventsData = await eventsRes.json()
          const events: DnsEvent[] = eventsData.data || eventsData || []
          
          events.forEach((event: DnsEvent) => {
            const ap = event.ap_ip
            if (!ap) return

            // Catat log terakhir yang diterima node ini
            if (!lastActivityByNode[ap] || event.timestamp > lastActivityByNode[ap]) {
              lastActivityByNode[ap] = event.timestamp
            }

            // Hanya hitung client sebagai "active" jika log terjadi dalam ACTIVE_WINDOW_MS
            const eventTime = new Date(event.timestamp).getTime()
            if (currentNow - eventTime < ACTIVE_WINDOW_MS) {
              if (!activeClientsByNode[ap]) {
                activeClientsByNode[ap] = new Set()
              }
              if (event.client_ip) {
                activeClientsByNode[ap].add(event.client_ip)
              }
            }
          })
        }
        
        // Gabungkan data node dengan status online dan client aktif saat ini
        const nodesWithClients: NodeWithClients[] = nodesData.map(node => {
          const ips = (node.ap_ip || '').split(',').map(s => s.trim()).filter(Boolean)
          const nodeActiveClients = new Set<string>()
          let lastAct = ''
          for (const ip of ips) {
            activeClientsByNode[ip]?.forEach(c => nodeActiveClients.add(c))
            if (lastActivityByNode[ip] && (!lastAct || lastActivityByNode[ip] > lastAct)) {
              lastAct = lastActivityByNode[ip]
            }
          }

          // Node dianggap Online hanya jika ada log yang masuk dalam ACTIVE_WINDOW_MS
          const isOnline = lastAct ? (currentNow - new Date(lastAct).getTime() < ACTIVE_WINDOW_MS) : false

          return {
            ...node,
            activeClientCount: isOnline ? nodeActiveClients.size : 0,
            isOnline,
            lastActivity: lastAct,
          }
        })
        
        setNodes(nodesWithClients)
      }
    } catch (error) {
      console.error('Failed to fetch network data:', error)
    } finally {
      setLoading(false)
    }
  }

  useLoad(fetchData, REFRESH_MS, resolvedParams.id)

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-line border-t-blue-500 rounded-full animate-spin"></div>
      </div>
    )
  }

  if (!group) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-chalk mb-2">Network Not Found</h1>
          <Link href="/settings" className="text-primary hover:text-primary">
            Go to Network Management
          </Link>
        </div>
      </div>
    )
  }

  // Ringkasan grup berdasarkan kondisi riil
  const totalActiveClients = nodes.reduce((sum, node) => sum + node.activeClientCount, 0)
  const activeNodesCount = nodes.filter(n => n.isOnline).length
  const isGroupOnline = activeNodesCount > 0

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        crumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Network Management', href: '/settings' }, { label: group.name }]}
        title={group.name}
        description={group.description || undefined}
      >
        <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-surface-2 rounded-lg p-4 border border-line">
            <div className="text-chalk-faint text-xs font-medium mb-1">Total nodes</div>
            <div className="text-2xl font-semibold text-chalk tabular-nums">{nodes.length}</div>
          </div>
          <div className="bg-surface-2 rounded-lg p-4 border border-line">
            <div className="text-chalk-faint text-xs font-medium mb-1">Active clients</div>
            <div className={`text-2xl font-semibold tabular-nums ${totalActiveClients > 0 ? 'text-safe' : 'text-chalk-faint'}`}>
              {totalActiveClients}
            </div>
          </div>
          <div className="bg-surface-2 rounded-lg p-4 border border-line">
            <div className="text-chalk-faint text-xs font-medium mb-1">Active nodes</div>
            <div className={`text-2xl font-semibold tabular-nums ${activeNodesCount > 0 ? 'text-primary' : 'text-chalk-faint'}`}>
              {activeNodesCount}
            </div>
          </div>
          <div className="bg-surface-2 rounded-lg p-4 border border-line">
            <div className="text-chalk-faint text-xs font-medium mb-1">Status</div>
            <div className={`text-sm font-semibold flex items-center gap-2 h-8 ${isGroupOnline ? 'text-safe' : 'text-chalk-faint'}`}>
              <span className={`w-2 h-2 rounded-full ${isGroupOnline ? 'bg-signal animate-pulse' : 'bg-line-strong'}`}></span>
              {isGroupOnline ? 'Online' : 'Offline'}
            </div>
          </div>
        </div>
      </PageHeader>

      {/* Nodes Grid */}
      <div className="page-x py-6 md:py-8">
        {nodes.length === 0 ? (
          <div className="bg-surface rounded-xl border border-line p-12 text-center">
            <p className="text-chalk-faint mb-4">No nodes configured for this network</p>
            <Link 
              href="/settings"
              className="inline-block px-4 py-2 bg-primary hover:bg-primary-hover text-on-primary rounded-lg transition-colors text-sm font-medium"
            >
              Add Nodes in Settings
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {nodes.map(node => (
              <Link
                key={node.id}
                href={`/networks/${group.id}/nodes/${node.id}`}
                className="bg-surface rounded-xl border border-line p-6 hover:border-primary/50 transition-all cursor-pointer group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-chalk truncate group-hover:text-primary transition-colors">
                      {node.name}
                    </h3>
                    <p className="text-xs text-chalk-faint font-mono truncate mt-1">{node.ap_ip}</p>
                  </div>
                  <div className="flex items-center gap-1.5 ml-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1.5 ${
                        node.isOnline
                          ? 'bg-safe/10 text-safe'
                          : 'bg-surface-3 text-chalk-faint'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${node.isOnline ? 'bg-safe animate-pulse' : 'bg-line-strong'}`} />
                      {node.isOnline ? 'Online' : 'Offline'}
                    </span>
                    <span className="px-2 py-0.5 bg-surface-3 text-chalk-dim rounded text-xs font-medium whitespace-nowrap">
                      {node.device_type}
                    </span>
                  </div>
                </div>

                {node.description && (
                  <p className="text-xs text-chalk-faint mb-4 line-clamp-2">{node.description}</p>
                )}

                {/* Client Count - Prominent Display */}
                <div className="bg-background rounded-lg p-4 border border-line group-hover:border-primary/30 transition-all">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-chalk-dim text-xs mb-1">Active Clients</div>
                      <div className={`text-3xl font-bold ${node.activeClientCount > 0 ? 'text-safe' : 'text-chalk-faint'}`}>
                        {node.activeClientCount}
                      </div>
                    </div>
                    <svg className="w-10 h-10 text-line-strong group-hover:text-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  
                  <div className="mt-3 pt-3 border-t border-line">
                    <div className="text-xs text-chalk-faint">
                      Last activity:{' '}
                      {node.lastActivity ? (
                        <span title={formatDateTimeWIB(node.lastActivity)}>
                          {timeAgo(node.lastActivity, now)}
                        </span>
                      ) : (
                        'No activity recorded'
                      )}
                    </div>
                  </div>
                </div>

                {/* Click indicator */}
                <div className="mt-4 flex items-center justify-between text-xs text-chalk-faint group-hover:text-primary transition-colors">
                  <span>View client details</span>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
