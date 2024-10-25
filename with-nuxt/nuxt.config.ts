export default defineNuxtConfig({
  compatibilityDate: '2024-04-03',
  
  devtools: {
    enabled: true,
  },

  future: {
    compatibilityVersion: 4
  },

  modules: [
    '@nuxtjs/tailwindcss',
    '@nuxt/icon',
  ],
})