import '@fontsource-variable/ibm-plex-sans'
import '@fontsource/ibm-plex-serif/400.css'
import '@fontsource/ibm-plex-serif/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
