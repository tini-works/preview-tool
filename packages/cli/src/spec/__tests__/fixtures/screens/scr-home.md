---
id: scr-home
type: screen
title: Home Screen
status: draft
states:
  - name: loading
    description: Loading data
    mockData:
      isLoading: true
      rooms: []
  - name: populated
    description: Rooms loaded
    mockData:
      isLoading: false
      rooms:
        - { id: "1", name: "Room A" }
        - { id: "2", name: "Room B" }
  - name: empty
    description: No rooms
    mockData:
      isLoading: false
      rooms: []
  - name: error
    description: Fetch failed
    mockData:
      isLoading: false
      error: "Connection failed"
data_deps:
  - hook: useRooms
    module: "@/hooks/useRooms"
    provides:
      - rooms
      - isLoading
      - error
---

# Home Screen

The main room listing.
