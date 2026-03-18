import { createApp } from 'vue'

import App from './App.vue'
import { initAuthSession } from './composables/useAuthSession'
import router from './router'
import 'remixicon/fonts/remixicon.css'
import './style.css'

initAuthSession()

createApp(App).use(router).mount('#app')
