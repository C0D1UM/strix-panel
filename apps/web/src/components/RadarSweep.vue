<!-- Decorative scan visual for the sign-in screen. The sweep stops when reduced motion is requested. -->
<template>
  <svg viewBox="0 0 400 400" class="h-auto w-full max-w-md" aria-hidden="true">
    <defs>
      <radialGradient id="radar-fade" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.10" />
        <stop offset="100%" stop-color="var(--accent)" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="radar-beam" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="var(--accent)" stop-opacity="0" />
        <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.45" />
      </linearGradient>
    </defs>
    <circle cx="200" cy="200" r="190" fill="url(#radar-fade)" />
    <g fill="none" stroke="var(--line)" stroke-width="1">
      <circle cx="200" cy="200" r="190" />
      <circle cx="200" cy="200" r="140" />
      <circle cx="200" cy="200" r="90" />
      <circle cx="200" cy="200" r="40" />
      <line x1="10" y1="200" x2="390" y2="200" />
      <line x1="200" y1="10" x2="200" y2="390" />
    </g>
    <g class="radar-sweep">
      <path d="M200 200 L200 10 A190 190 0 0 1 334 66 Z" fill="url(#radar-beam)" />
      <line x1="200" y1="200" x2="334" y2="66" stroke="var(--accent)" stroke-width="1.5" />
    </g>
    <g fill="var(--accent)">
      <circle cx="268" cy="118" r="4" />
      <circle cx="132" cy="262" r="3" opacity="0.7" />
      <circle cx="292" cy="248" r="3" opacity="0.5" />
    </g>
    <circle
      cx="268"
      cy="118"
      r="4"
      fill="none"
      stroke="var(--danger)"
      stroke-width="1.5"
      class="radar-ping"
    />
  </svg>
</template>

<style scoped>
.radar-sweep {
  transform-origin: 200px 200px;
  animation: sweep 6s linear infinite;
}

.radar-ping {
  transform-origin: 268px 118px;
  animation: ping 6s ease-out infinite;
}

@keyframes sweep {
  to {
    transform: rotate(360deg);
  }
}

@keyframes ping {
  0%,
  13% {
    transform: scale(1);
    opacity: 0;
  }
  15% {
    opacity: 1;
  }
  45%,
  100% {
    transform: scale(4);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .radar-sweep,
  .radar-ping {
    animation: none;
  }
}
</style>
