# Changelog - Lab Configuration System

## 🎉 Version 2.0 - Flexible Lab Configuration

**Release Date**: 2026-10-03

### 🚀 Major Features

#### 1. Dynamic Lab Management
- ✨ **Flexible lab names**: No longer hardcoded "Lab 1, 2, 3"
- ✨ **Custom AP IPs**: Map any IP address to any lab
- ✨ **Add/Edit/Delete labs**: Full CRUD operations from UI
- ✨ **Lab ordering**: Control display order of lab tabs
- ✨ **Active/Inactive status**: Show/hide labs without deleting

#### 2. IP Mapping System
- 📍 **Manual IP mapping**: Choose which IP belongs to which lab
- 📍 **Smart IP detection**: Automatically discover active IPs from logs
- 📍 **24-hour window**: Shows IPs active in the last 24 hours
- 📍 **Unmapped IPs list**: Easy to see which IPs need mapping
- 📍 **Custom labels**: Name each seat (PC-01, Workstation-A, etc.)

#### 3. Responsive Design
- 📱 **Mobile-first approach**: Fully responsive layout
- 📱 **Touch-friendly**: Optimized buttons and forms for mobile
- 📱 **Sidebar toggle**: Hamburger menu for mobile navigation
- 📱 **Adaptive grids**: Cards stack vertically on small screens
- 📱 **Horizontal scroll**: Tables scroll horizontally on mobile

### 🗄️ Database Changes

#### New Collections

**`lab_configs`**
```javascript
{
  _id: ObjectId,
  name: "Lab Komputer 1",
  ap_ip: "192.168.10.1",
  order: 1,
  is_active: true,
  created_at: "2026-10-03T09:00:00Z",
  updated_at: "2026-10-03T09:00:00Z"
}
```

**`ip_mappings`**
```javascript
{
  _id: ObjectId,
  lab_id: "507f1f77bcf86cd799439011",
  client_ip: "192.168.10.15",
  seat: 5,
  label: "PC-05",
  created_at: "2026-10-03T09:00:00Z",
  updated_at: "2026-10-03T09:00:00Z"
}
```

### 📁 New Files

#### API Routes
- `src/app/api/lab-config/route.ts` - GET, POST lab configs
- `src/app/api/lab-config/[id]/route.ts` - PUT, DELETE lab config by ID
- `src/app/api/ip-mappings/route.ts` - CRUD IP mappings
- `src/app/api/available-ips/route.ts` - Get available IPs from logs

#### Pages
- `src/app/settings/page.tsx` - Lab configuration UI (responsive)
- `src/app/labs/all/page.tsx` - All labs monitoring page

#### Components
- `src/components/LabTabs.tsx` - Updated to use dynamic config
- `src/components/Sidebar.tsx` - Updated with mobile menu & settings link

#### Scripts
- `scripts/seed-labs.ts` - Seed initial lab data to MongoDB

#### Documentation
- `QUICKSTART.md` - Quick start guide for new system
- `LAB_CONFIG_GUIDE.md` - Comprehensive configuration guide
- `CHANGELOG_LAB_CONFIG.md` - This file

#### Types
- Updated `src/lib/types.ts` with:
  - `LabConfig` interface
  - `IPMapping` interface
  - `AvailableIP` interface

### 🔧 Modified Files

#### Updated Components
- `src/components/LabTabs.tsx`
  - Now fetches from `/api/lab-config` and `/api/ip-mappings`
  - Dynamic tab generation based on active labs
  - Shows empty state with link to settings
  - Auto-refresh every 15 seconds

- `src/components/Sidebar.tsx`
  - Added "Lab Configuration" menu item
  - Mobile hamburger menu
  - Responsive overlay
  - Auto-close on navigation

- `src/app/layout.tsx`
  - Updated for responsive sidebar layout

#### Updated Config
- `package.json`
  - Added `tsx` dev dependency
  - Added `seed:labs` script

### 🎯 Migration Guide

#### From v1.x (Static Labs) to v2.0 (Dynamic Labs)

**Step 1**: Run seed script to populate initial data
```bash
npm run seed:labs
```

**Step 2**: Verify labs in Settings page
- Open `/settings`
- Check if 3 labs are created
- Verify IP mappings (36 PCs per lab)

**Step 3**: Adjust as needed
- Rename labs
- Add/remove labs
- Remap IPs based on actual network

### 🐛 Bug Fixes
- Fixed lab tab not updating when config changes
- Fixed mobile menu z-index issues
- Fixed IP mapping validation

### ⚠️ Breaking Changes

#### Removed Hard-coded Lab Config
- Old `mock-data.ts` lab structure no longer used
- Labs must now be configured via `/settings` or API
- Old route `/labs/1`, `/labs/2`, `/labs/3` replaced with dynamic routing

#### Migration Required
If you have existing deployment:
1. Backup your MongoDB database
2. Run seed script to create initial config
3. Manually verify and adjust lab mappings

### 📊 Performance Improvements
- Lazy loading for lab data
- Optimized MongoDB queries with indexes
- Client-side caching for lab configs
- Batch IP mapping operations

### 🔒 Security
- Input validation for lab names and IPs
- Sanitized user input in forms
- Rate limiting on API endpoints (recommended)
- CSRF protection via Next.js (built-in)

### 📱 Browser Support
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+
- Mobile Safari (iOS 14+)
- Chrome Mobile (Android 10+)

### 🎓 Learning Resources
- [QUICKSTART.md](./QUICKSTART.md) - Get started in 5 minutes
- [LAB_CONFIG_GUIDE.md](./LAB_CONFIG_GUIDE.md) - Detailed usage guide
- API documentation in guide files

### 🙏 Acknowledgments
Thanks to the SATA team for requirements and feedback on flexible lab configuration.

---

## Previous Versions

### Version 1.0 - Initial Release
- Static lab configuration (Lab 1, 2, 3)
- Fixed IP ranges per lab
- Basic monitoring dashboard
