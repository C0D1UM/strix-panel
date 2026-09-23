<script setup lang="ts">
import UserAvatar from '../components/UserAvatar.vue'
import { currentUser } from '../lib/current-user'
</script>

<template>
  <div class="mx-auto max-w-5xl px-4 py-10 sm:px-8">
    <div v-if="currentUser" class="flex flex-wrap items-center gap-4">
      <UserAvatar :name="currentUser.name" :image="currentUser.image" size="lg" />
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Hi, {{ currentUser.name }}</h1>
        <p class="flex items-center gap-2 text-sm text-fg-muted">
          {{ currentUser.email }}
          <span
            class="rounded-full border px-2 py-0.5 text-xs font-medium"
            :class="currentUser.role === 'admin' ? 'border-accent text-accent' : 'border-line'"
          >
            {{ currentUser.role === 'admin' ? 'Admin' : 'Member' }}
          </span>
        </p>
      </div>
    </div>

    <section
      class="mt-10 rounded-lg border border-dashed border-line px-6 py-16 text-center"
      aria-labelledby="scans-empty"
    >
      <span class="icon-[lucide--radar] size-8 text-fg-muted" aria-hidden="true" />
      <h2 id="scans-empty" class="mt-3 font-semibold">No scans yet</h2>
      <p class="mx-auto mt-1 max-w-sm text-sm text-fg-muted">
        Projects and scans are coming next. Once they land, your runs, findings and token usage will
        show up here.
      </p>
    </section>
  </div>
</template>
