import { readonly, ref } from 'vue'

export const SIDEBAR_STORAGE_KEY = 'strix-panel:sidebar-collapsed'

function readCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

// Desktop: expanded or collapsed to an icon rail (remembered). Mobile: an off-canvas drawer (not remembered).
const collapsed = ref(readCollapsed())
const mobileOpen = ref(false)

export function useSidebar() {
  function toggleCollapsed() {
    collapsed.value = !collapsed.value
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed.value))
    } catch {
      // Storage unavailable; the choice lasts for this session only.
    }
  }

  return {
    collapsed: readonly(collapsed),
    mobileOpen: readonly(mobileOpen),
    toggleCollapsed,
    openMobile: () => (mobileOpen.value = true),
    closeMobile: () => (mobileOpen.value = false),
  }
}
