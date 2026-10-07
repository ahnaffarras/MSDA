'use client'

import { useState } from 'react'
import { useLoad } from '@/lib/useLoad'
import { useAuth } from '@/contexts/AuthContext'
import { adminFetch } from '@/lib/admin-client'
import PageHeader from '@/components/PageHeader'
import type { Group, Node } from '@/lib/types'

export default function SettingsPage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [nodes, setNodes] = useState<Node[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'groups' | 'nodes'>('groups')
  const { isAdmin, loading: authLoading } = useAuth()
  
  // Modal states
  const [showAddGroupModal, setShowAddGroupModal] = useState(false)
  const [showAddNodeModal, setShowAddNodeModal] = useState(false)
  const [editingGroup, setEditingGroup] = useState<Group | null>(null)
  const [editingNode, setEditingNode] = useState<Node | null>(null)
  
  // Form states
  const [groupForm, setGroupForm] = useState({ 
    name: '', 
    description: ''
  })
  const [nodeForm, setNodeForm] = useState({
    group_id: '',
    name: '',
    ap_ip: '',
    device_type: 'AP',
    description: ''
  })

  const fetchData = async () => {
    try {
      const [groupsRes, nodesRes] = await Promise.all([
        fetch('/api/groups'),
        fetch('/api/nodes')
      ])
      
      if (groupsRes.ok) {
        const groupsData = await groupsRes.json()
        setGroups(Array.isArray(groupsData) ? groupsData : [])
      }
      
      if (nodesRes.ok) {
        const nodesData = await nodesRes.json()
        setNodes(Array.isArray(nodesData) ? nodesData : [])
      }
    } catch (error) {
      console.error('Failed to fetch:', error)
    } finally {
      setLoading(false)
    }
  }

  useLoad(fetchData)

  const handleAddGroup = async () => {
    if (!isAdmin) {
      alert('Only administrators can manage groups.')
      return
    }
    if (!groupForm.name) return
    
    try {
      const method = editingGroup ? 'PUT' : 'POST'
      const url = editingGroup ? `/api/groups/${editingGroup.id}` : '/api/groups'
      
      const res = await adminFetch(url, {
        method,
        body: JSON.stringify(groupForm)
      })

      if (res.status === 403) {
        alert('Only administrators can manage groups.')
        return
      }
      
      if (res.ok) {
        await fetchData()
        setShowAddGroupModal(false)
        setEditingGroup(null)
        setGroupForm({ name: '', description: '' })
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data?.error || 'Failed to save group')
      }
    } catch (error) {
      console.error('Failed to save group:', error)
    }
  }

  const handleDeleteGroup = async (id: string) => {
    if (!isAdmin) {
      alert('Only administrators can delete groups.')
      return
    }
    if (!confirm('Delete this group? All nodes under this group will also be deleted.')) return
    
    try {
      const res = await adminFetch(`/api/groups/${id}`, { method: 'DELETE' })
      if (res.status === 403) {
        alert('Only administrators can delete groups.')
        return
      }
      if (res.ok) {
        await fetchData()
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data?.error || 'Failed to delete group')
      }
    } catch (error) {
      console.error('Failed to delete group:', error)
    }
  }

  const handleAddNode = async () => {
    if (!isAdmin) {
      alert('Only administrators can manage nodes.')
      return
    }
    if (!nodeForm.group_id || !nodeForm.name || !nodeForm.ap_ip) {
      alert('Please fill in all required fields')
      return
    }
    
    try {
      const method = editingNode ? 'PUT' : 'POST'
      const url = editingNode ? `/api/nodes/${editingNode.id}` : '/api/nodes'
      
      const res = await adminFetch(url, {
        method,
        body: JSON.stringify(nodeForm)
      })

      if (res.status === 403) {
        alert('Only administrators can manage nodes.')
        return
      }
      
      if (res.ok) {
        await fetchData()
        setShowAddNodeModal(false)
        setEditingNode(null)
        setNodeForm({ group_id: '', name: '', ap_ip: '', device_type: 'AP', description: '' })
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data?.error || 'Failed to save node')
      }
    } catch (error) {
      console.error('Failed to save node:', error)
    }
  }

  const handleDeleteNode = async (id: string) => {
    if (!isAdmin) {
      alert('Only administrators can delete nodes.')
      return
    }
    if (!confirm('Delete this node?')) return
    
    try {
      const res = await adminFetch(`/api/nodes/${id}`, { method: 'DELETE' })
      if (res.status === 403) {
        alert('Only administrators can delete nodes.')
        return
      }
      if (res.ok) {
        await fetchData()
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data?.error || 'Failed to delete node')
      }
    } catch (error) {
      console.error('Failed to delete node:', error)
    }
  }

  const getNodeCountByGroup = (groupId: string) => {
    return nodes.filter(n => n.group_id === groupId).length
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-line border-t-blue-500 rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title="Network Management"
        description="Manage the classes, rooms and access points that SATA monitors."
        actions={
          isAdmin ? (
            <button
              onClick={() => {
                if (activeTab === 'groups') {
                  setEditingGroup(null)
                  setGroupForm({ name: '', description: '' })
                  setShowAddGroupModal(true)
                } else {
                  setEditingNode(null)
                  setNodeForm({ group_id: '', name: '', ap_ip: '', device_type: 'AP', description: '' })
                  setShowAddNodeModal(true)
                }
              }}
              className="btn btn-primary w-full sm:w-auto"
            >
              + Add {activeTab === 'groups' ? 'group' : 'node'}
            </button>
          ) : undefined
        }
      />

      <div className="page-x py-6 md:py-8">
        {!authLoading && !isAdmin && (
          <p className="rounded-lg border border-watch-border bg-watch-bg px-3.5 py-2.5 text-sm text-watch mb-6">
            You have view-only access. Only administrators can add, edit, or delete groups and nodes.
          </p>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          <button
            onClick={() => setActiveTab('groups')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'groups'
                ? 'bg-primary text-on-primary'
                : 'bg-surface text-chalk-dim hover:text-chalk'
            }`}
          >
            Manage Groups
          </button>
          <button
            onClick={() => setActiveTab('nodes')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'nodes'
                ? 'bg-primary text-on-primary'
                : 'bg-surface text-chalk-dim hover:text-chalk'
            }`}
          >
            Manage Nodes ({nodes.length})
          </button>
        </div>

        {/* Groups Tab */}
        {activeTab === 'groups' && (
          <div className="space-y-4">
            {groups.length === 0 ? (
              <div className="bg-surface rounded-xl border border-line p-12 text-center">
                <p className="text-chalk-faint mb-4">No groups configured yet</p>
                {isAdmin && (
                  <button
                    onClick={() => setShowAddGroupModal(true)}
                    className="px-4 py-2 bg-primary hover:bg-primary-hover text-on-primary rounded-lg transition-colors text-sm font-medium"
                  >
                    Create First Group
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {groups.map(group => {
                  const nodeCount = getNodeCountByGroup(group.id)
                  return (
                    <div
                      key={group.id}
                      className="bg-surface rounded-xl border border-line p-6 hover:border-primary/50 transition-all"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-semibold text-chalk truncate">{group.name}</h3>
                          <p className="text-xs text-chalk-faint mt-1">{nodeCount} nodes</p>
                        </div>
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap ml-2 ${
                            group.is_active
                              ? 'bg-safe/10 text-safe'
                              : 'bg-surface-3 text-chalk-faint'
                          }`}
                        >
                          {group.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>

                      {group.description && (
                        <p className="text-xs text-chalk-faint mb-4 line-clamp-2">{group.description}</p>
                      )}

                      {isAdmin && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditingGroup(group)
                              setGroupForm({ 
                                name: group.name, 
                                description: group.description || ''
                              })
                              setShowAddGroupModal(true)
                            }}
                            className="flex-1 px-3 py-2 bg-background hover:bg-surface-3 text-chalk rounded-lg transition-colors text-sm"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteGroup(group.id)}
                            className="flex-1 px-3 py-2 bg-flag/10 hover:bg-flag/20 text-flag rounded-lg transition-colors text-sm"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Nodes Tab */}
        {activeTab === 'nodes' && (
          <div className="space-y-4">
            {groups.length === 0 ? (
              <div className="bg-surface rounded-xl border border-line p-12 text-center">
                <p className="text-chalk-faint">
                  {isAdmin ? 'Create a group first before adding nodes' : 'No groups configured yet'}
                </p>
              </div>
            ) : nodes.length === 0 ? (
              <div className="bg-surface rounded-xl border border-line p-12 text-center">
                <p className="text-chalk-faint mb-4">No nodes configured yet</p>
                {isAdmin && (
                  <button
                    onClick={() => setShowAddNodeModal(true)}
                    className="px-4 py-2 bg-primary hover:bg-primary-hover text-on-primary rounded-lg transition-colors text-sm font-medium"
                  >
                    Add First Node
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {groups.map(group => {
                  const groupNodes = nodes.filter(n => n.group_id === group.id)
                  if (groupNodes.length === 0) return null
                  
                  return (
                    <div key={group.id} className="bg-surface rounded-xl border border-line overflow-hidden">
                      <div className="border-b border-line px-6 py-4 bg-surface-2">
                        <h2 className="text-lg font-semibold text-chalk">{group.name}</h2>
                        <p className="text-sm text-chalk-faint mt-0.5">{groupNodes.length} nodes</p>
                      </div>
                      
                      <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {groupNodes.map(node => (
                          <div
                            key={node.id}
                            className="bg-background rounded-lg p-4 hover:bg-surface-3 transition-colors"
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1 min-w-0">
                                <h3 className="text-base font-semibold text-chalk truncate">{node.name}</h3>
                                <p className="text-xs text-chalk-faint font-mono truncate">{node.ap_ip}</p>
                              </div>
                              <span className="px-2 py-1 bg-surface-3 text-chalk-dim rounded text-xs font-medium whitespace-nowrap ml-2">
                                {node.device_type}
                              </span>
                            </div>
                            
                            {node.description && (
                              <p className="text-xs text-chalk-faint mb-3 line-clamp-2">{node.description}</p>
                            )}
                            
                            {isAdmin && (
                              <div className="flex gap-2">
                                <button
                                  onClick={() => {
                                    setEditingNode(node)
                                    setNodeForm({
                                      group_id: node.group_id,
                                      name: node.name,
                                      ap_ip: node.ap_ip,
                                      device_type: node.device_type,
                                      description: node.description || ''
                                    })
                                    setShowAddNodeModal(true)
                                  }}
                                  className="flex-1 px-3 py-1.5 bg-surface hover:bg-surface-3 text-chalk rounded-lg transition-colors text-xs"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteNode(node.id)}
                                  className="flex-1 px-3 py-1.5 bg-flag/10 hover:bg-flag/20 text-flag rounded-lg transition-colors text-xs"
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add/Edit Group Modal */}
      {isAdmin && showAddGroupModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-surface rounded-xl border border-line w-full max-w-md">
            <div className="border-b border-line px-6 py-4">
              <h2 className="text-lg font-semibold text-chalk">
                {editingGroup ? 'Edit Group' : 'Add New Group'}
              </h2>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-chalk mb-2">
                  Group Name *
                </label>
                <input
                  type="text"
                  value={groupForm.name}
                  onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                  placeholder="e.g., Class A, Multimedia Lab, Server Room"
                  className="w-full px-4 py-2 bg-background border border-line rounded-lg text-chalk placeholder-chalk-faint focus:border-primary focus:outline-none"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-chalk mb-2">
                  Description (optional)
                </label>
                <textarea
                  value={groupForm.description}
                  onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })}
                  placeholder="Brief description about this group"
                  rows={3}
                  className="w-full px-4 py-2 bg-background border border-line rounded-lg text-chalk placeholder-chalk-faint focus:border-primary focus:outline-none resize-none"
                />
              </div>
            </div>
            
            <div className="border-t border-line px-6 py-4 flex gap-3">
              <button
                onClick={() => {
                  setShowAddGroupModal(false)
                  setEditingGroup(null)
                  setGroupForm({ name: '', description: '' })
                }}
                className="flex-1 px-4 py-2 bg-background hover:bg-surface-3 text-chalk rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddGroup}
                className="flex-1 px-4 py-2 bg-primary hover:bg-primary-hover text-on-primary rounded-lg transition-colors font-medium"
              >
                {editingGroup ? 'Save' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Node Modal */}
      {isAdmin && showAddNodeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-surface rounded-xl border border-line w-full max-w-md">
            <div className="border-b border-line px-6 py-4">
              <h2 className="text-lg font-semibold text-chalk">
                {editingNode ? 'Edit Node' : 'Add New Node'}
              </h2>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-chalk mb-2">
                  Group *
                </label>
                <select
                  value={nodeForm.group_id}
                  onChange={(e) => setNodeForm({ ...nodeForm, group_id: e.target.value })}
                  disabled={!!editingNode}
                  className="w-full px-4 py-2 bg-background border border-line rounded-lg text-chalk focus:border-primary focus:outline-none disabled:opacity-50"
                >
                  <option value="">-- Select Group --</option>
                  {groups.map(group => (
                    <option key={group.id} value={group.id}>{group.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-chalk mb-2">
                  Node Name *
                </label>
                <input
                  type="text"
                  value={nodeForm.name}
                  onChange={(e) => setNodeForm({ ...nodeForm, name: e.target.value })}
                  placeholder="e.g., AP r.23, Server Main, Router 1"
                  className="w-full px-4 py-2 bg-background border border-line rounded-lg text-chalk placeholder-chalk-faint focus:border-primary focus:outline-none"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-chalk mb-2">
                  IP Address *
                </label>
                <input
                  type="text"
                  value={nodeForm.ap_ip}
                  onChange={(e) => setNodeForm({ ...nodeForm, ap_ip: e.target.value })}
                  placeholder="192.168.1.1"
                  className="w-full px-4 py-2 bg-background border border-line rounded-lg text-chalk placeholder-chalk-faint focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-chalk mb-2">
                  Device Type
                </label>
                <select
                  value={nodeForm.device_type}
                  onChange={(e) => setNodeForm({ ...nodeForm, device_type: e.target.value })}
                  className="w-full px-4 py-2 bg-background border border-line rounded-lg text-chalk focus:border-primary focus:outline-none"
                >
                  <option value="AP">Access Point</option>
                  <option value="Server">Server</option>
                  <option value="Router">Router</option>
                  <option value="Switch">Switch</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-chalk mb-2">
                  Description (optional)
                </label>
                <textarea
                  value={nodeForm.description}
                  onChange={(e) => setNodeForm({ ...nodeForm, description: e.target.value })}
                  placeholder="Brief description about this node"
                  rows={2}
                  className="w-full px-4 py-2 bg-background border border-line rounded-lg text-chalk placeholder-chalk-faint focus:border-primary focus:outline-none resize-none"
                />
              </div>
            </div>
            
            <div className="border-t border-line px-6 py-4 flex gap-3">
              <button
                onClick={() => {
                  setShowAddNodeModal(false)
                  setEditingNode(null)
                  setNodeForm({ group_id: '', name: '', ap_ip: '', device_type: 'AP', description: '' })
                }}
                className="flex-1 px-4 py-2 bg-background hover:bg-surface-3 text-chalk rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddNode}
                className="flex-1 px-4 py-2 bg-primary hover:bg-primary-hover text-on-primary rounded-lg transition-colors font-medium"
              >
                {editingNode ? 'Save' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
