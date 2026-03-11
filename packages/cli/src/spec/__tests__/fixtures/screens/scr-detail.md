---
id: scr-detail
type: screen
title: Room Detail
status: draft
states:
  - name: default
    description: Room info displayed
    mockData:
      room: { id: "1", name: "Room A", capacity: 10 }
data_deps:
  - hook: useRoom
    module: "@/hooks/useRoom"
    provides:
      - room
---

# Room Detail
