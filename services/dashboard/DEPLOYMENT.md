# 🚀 Deployment Guide - Lab Configuration System

## Pre-Deployment Checklist

- [x] All code files created
- [x] TypeScript types defined
- [x] API routes implemented
- [x] UI components updated
- [x] Responsive design verified
- [x] Documentation written

## Deployment Steps

### Step 1: Backup Current System

```bash
# Backup MongoDB
mongodump --uri="mongodb://localhost:27017/msda" --out=/backup/msda-$(date +%Y%m%d)

# Backup application code (if not using git)
cd /home/turgocloud/msda-prod/msda/services
tar -czf dashboard-backup-$(date +%Y%m%d).tar.gz dashboard/
```

### Step 2: Install Dependencies

```bash
cd /home/turgocloud/msda-prod/msda/services/dashboard

# If tsx is not installed
npm install --save-dev tsx

# Or install all dependencies
npm install
```

### Step 3: Database Setup

#### Option A: Seed with Default Data (Recommended for Testing)

```bash
# This creates 3 labs with 36 PCs each
npm run seed:labs
```

Expected output:
```
✓ Connected to MongoDB
→ Seeding lab configs...
✓ Created 3 lab configs
→ Seeding IP mappings...
✓ Created 108 IP mappings
🎉 Seed completed successfully!
```

#### Option B: Start Fresh (Production)

Skip seeding and let admins create labs manually via `/settings`

### Step 4: Build Application

```bash
# Build Next.js for production
npm run build
```

### Step 5: Restart Application

#### If using PM2:
```bash
pm2 restart dashboard
pm2 logs dashboard  # Check for errors
```

#### If using systemd:
```bash
sudo systemctl restart dashboard
sudo systemctl status dashboard
```

#### If running manually:
```bash
npm run start
```

### Step 6: Verify Deployment

1. **Check API Health**:
   ```bash
   curl http://localhost:3000/api/lab-config
   # Should return array of labs (or empty array)
   ```

2. **Test Available IPs**:
   ```bash
   curl http://localhost:3000/api/available-ips?hours=24
   # Should return IPs from dns_events
   ```

3. **Open Browser**:
   - Navigate to `http://your-server/settings`
   - Verify settings page loads
   - Try creating a test lab
   - Try mapping an IP

### Step 7: Create MongoDB Indexes (Performance)

```bash
mongosh msda << 'EOF'
// Lab configs indexes
db.lab_configs.createIndex({ order: 1 });
db.lab_configs.createIndex({ is_active: 1 });

// IP mappings indexes
db.ip_mappings.createIndex({ lab_id: 1 });
db.ip_mappings.createIndex({ client_ip: 1 }, { unique: true });
db.ip_mappings.createIndex({ lab_id: 1, seat: 1 });

// DNS events indexes (if not exist)
db.dns_events.createIndex({ timestamp: -1 });
db.dns_events.createIndex({ client_ip: 1, timestamp: -1 });

// Show created indexes
print("\n=== Lab Configs Indexes ===");
db.lab_configs.getIndexes();
print("\n=== IP Mappings Indexes ===");
db.ip_mappings.getIndexes();
EOF
```

## Post-Deployment Testing

### 1. Desktop Browser Testing

- [ ] Open `/settings` - page loads without errors
- [ ] Click "Tambah Lab" - modal appears
- [ ] Create new lab - success message shown
- [ ] Edit lab name - changes saved
- [ ] Switch to "Mapping IP" tab - IPs listed
- [ ] Map IP to lab - mapping created
- [ ] Go to `/labs/all` - new lab appears in tabs
- [ ] Click lab tab - shows mapped PCs

### 2. Mobile Browser Testing

- [ ] Open homepage - hamburger menu visible
- [ ] Click hamburger - sidebar slides in
- [ ] Navigate to Settings - page responsive
- [ ] Create lab on mobile - modal full-width
- [ ] Scroll IP list - horizontal scroll works
- [ ] Map IP on mobile - button full-width

### 3. API Testing

```bash
# Test creating lab
curl -X POST http://localhost:3000/api/lab-config \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Lab","ap_ip":"192.168.99.1"}'

# Test getting labs
curl http://localhost:3000/api/lab-config

# Test getting available IPs
curl http://localhost:3000/api/available-ips?hours=24

# Test mapping IP
curl -X POST http://localhost:3000/api/ip-mappings \
  -H "Content-Type: application/json" \
  -d '{"lab_id":"YOUR_LAB_ID","client_ip":"192.168.99.10","seat":1,"label":"PC-01"}'
```

## Rollback Plan

If deployment fails or critical bugs found:

### Quick Rollback

```bash
# Stop current version
pm2 stop dashboard

# Restore backup code
cd /home/turgocloud/msda-prod/msda/services
tar -xzf dashboard-backup-YYYYMMDD.tar.gz

# Restore MongoDB (if needed)
mongorestore --uri="mongodb://localhost:27017/msda" /backup/msda-YYYYMMDD/msda

# Rebuild and restart
cd dashboard
npm run build
pm2 restart dashboard
```

### Partial Rollback (Keep DB, Rollback Code)

If database changes are fine but code has issues:

```bash
# Just restore code
cd /home/turgocloud/msda-prod/msda/services
rm -rf dashboard
tar -xzf dashboard-backup-YYYYMMDD.tar.gz
cd dashboard
npm run build
pm2 restart dashboard
```

## Monitoring

### Check Logs

```bash
# Application logs
pm2 logs dashboard

# MongoDB logs
sudo tail -f /var/log/mongodb/mongod.log

# Nginx/Apache logs (if using reverse proxy)
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Performance Monitoring

```bash
# Check MongoDB query performance
mongosh msda << 'EOF'
db.lab_configs.explain("executionStats").find({}).sort({ order: 1 })
db.ip_mappings.explain("executionStats").find({ lab_id: "some_id" })
EOF

# Check API response times
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:3000/api/lab-config

# curl-format.txt:
time_namelookup:  %{time_namelookup}\n
time_connect:  %{time_connect}\n
time_total:  %{time_total}\n
```

## Common Issues & Solutions

### Issue: "Lab configs already exist" when seeding

**Solution**: This is normal if already seeded. To re-seed:
```bash
mongosh msda --eval "db.lab_configs.drop(); db.ip_mappings.drop();"
npm run seed:labs
```

### Issue: "MONGODB_URI is not set"

**Solution**: Set environment variable:
```bash
export MONGODB_URI="mongodb://localhost:27017"
export MONGODB_DB="msda"
# Or add to .env.local file
```

### Issue: Labs not appearing in dashboard

**Solution**: 
1. Check if labs are active: `db.lab_configs.find({ is_active: true })`
2. Check if IPs are mapped: `db.ip_mappings.find({ lab_id: "xxx" })`
3. Clear browser cache
4. Check browser console for errors

### Issue: Mobile menu not working

**Solution**:
1. Check z-index of overlay and sidebar
2. Clear browser cache
3. Test in incognito mode
4. Check for JavaScript errors in console

### Issue: Slow API responses

**Solution**:
1. Add MongoDB indexes (see Step 7)
2. Check MongoDB server status
3. Increase MongoDB connection pool
4. Enable API caching for static data

## Security Considerations

### Production Environment

1. **Environment Variables**:
   ```bash
   # .env.production
   MONGODB_URI=mongodb://username:password@localhost:27017
   MONGODB_DB=msda
   NODE_ENV=production
   ```

2. **API Rate Limiting** (recommended):
   ```typescript
   // Add to middleware
   import rateLimit from 'express-rate-limit'
   
   const limiter = rateLimit({
     windowMs: 15 * 60 * 1000, // 15 minutes
     max: 100 // limit each IP to 100 requests per windowMs
   })
   ```

3. **Input Validation**:
   Already implemented in API routes with basic validation

4. **HTTPS**:
   Configure reverse proxy (Nginx/Apache) with SSL certificate

### Database Security

```bash
# Enable MongoDB authentication
mongosh admin
use admin
db.createUser({
  user: "msda_admin",
  pwd: "strong_password",
  roles: [ { role: "readWrite", db: "msda" } ]
})

# Update connection string
MONGODB_URI="mongodb://msda_admin:strong_password@localhost:27017/msda?authSource=admin"
```

## Maintenance

### Regular Tasks

**Daily**:
- Check application logs for errors
- Monitor API response times
- Verify auto-refresh is working

**Weekly**:
- Review unmapped IPs in `/settings`
- Clean up inactive lab configs
- Check MongoDB disk usage

**Monthly**:
- Backup database
- Update dependencies
- Review and optimize queries

## Support

For issues during deployment:

1. Check logs first: `pm2 logs dashboard`
2. Review [QUICKSTART.md](./QUICKSTART.md) and [LAB_CONFIG_GUIDE.md](./LAB_CONFIG_GUIDE.md)
3. Test API endpoints directly with curl
4. Check MongoDB connection and collections

## Success Criteria

Deployment is successful when:

- ✅ All API endpoints return 200 status
- ✅ Settings page loads and functions
- ✅ Can create, edit, delete labs
- ✅ Can map/unmap IPs
- ✅ LabTabs shows dynamic labs
- ✅ Mobile menu works properly
- ✅ No console errors in browser
- ✅ No errors in PM2 logs

---

**Deployment completed? Mark the date and version:**

- Deployed on: _____________
- Version: 2.0.0
- Deployed by: _____________
- Rollback tested: Yes / No
