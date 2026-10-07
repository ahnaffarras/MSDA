'use client'

import { LabTabs } from '@/components/LabTabs'
import PageHeader from '@/components/PageHeader'

export default function AllLabsPage() {
  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        crumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Lab Monitoring' }]}
        title="Computer Lab Monitoring"
        description="Real-time activity across all labs."
        actions={
          <a href="/settings" className="btn w-full sm:w-auto">
            Manage groups
          </a>
        }
      />

      {/* Lab Tabs */}
      <div className="page-x py-6 md:py-8">
        <LabTabs />
      </div>
    </div>
  )
}
