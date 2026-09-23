import { createApp } from 'vue'
import App from './App.vue'
import { useTheme } from './composables/useTheme'
import { router } from './router'
import './styles/main.css'

useTheme()
createApp(App).use(router).mount('#app')
