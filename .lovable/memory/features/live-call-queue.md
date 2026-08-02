---
name: Live Call Queue
description: Real-time /live-queue page showing all active inbound + outbound calls plus auto-dialer queue depth and today's completion counts
type: feature
---
- Page: /live-queue (sidebar entry "Live Queue", Activity icon)
- Top stats: Active Inbound count, Active Outbound count, Auto-Dialer pending queue depth, Completed Today (split inbound/outbound)
- Realtime subscription on `calls` and `auto_dialer_leads` tables
- In-flight table: direction badge, phone, status, live elapsed timer (re-rendered every second), started_at
- Click any active call row → opens CallDetailDialog with full transcript/recording
- Today's completed count refreshes when calls table changes