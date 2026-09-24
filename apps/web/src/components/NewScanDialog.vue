<script setup lang="ts">
import { useRouter } from 'vue-router'
import type { Scan } from '../lib/scans'
import NewScanForm from './NewScanForm.vue'
import AppDialog from './ui/AppDialog.vue'

const open = defineModel<boolean>('open', { required: true })
const router = useRouter()

async function onCreated(scan: Scan) {
  open.value = false
  await router.push({ name: 'scan', params: { id: scan.id } })
}
</script>

<template>
  <AppDialog
    v-model:open="open"
    title="New scan"
    description="The scan starts as soon as a worker is free."
  >
    <NewScanForm v-if="open" @created="onCreated" />
  </AppDialog>
</template>
