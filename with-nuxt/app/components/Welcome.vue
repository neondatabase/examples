<script setup lang="ts">
defineProps<{
  version: string
}>()
</script>

<template>
    <div class="flex flex-col justify-between h-screen container mx-auto px-4 py-16">
      <div class="flex flex-col items-center justify-center space-y-8">
        <div class="flex gap-6 items-center">
          <Icon class="w-16 h-16" name="logos:nuxt-icon" />
          <div class="text-3xl">+</div>
          <Icon class="w-12 h-12" name="logos:neon-icon" />
        </div>
        <h1 class="text-4xl font-bold text-center">
          Welcome to Nuxt Neon!
        </h1>
        <NuxtLink to="https://neon.tech/docs/guides/nuxt" class="w-full max-w-3xl bg-zinc-900 rounded-lg p-8 border border-zinc-800 hover:border-green-400">
          <div class="flex flex-col items-center space-y-4">
            <div class="flex items-center gap-2 bg-zinc-800 p-3 rounded-lg">
              <Icon class="w-10 h-10 block" name="ph:rocket-duotone" />
            </div>
            <h2 class="text-2xl font-semibold">Get started</h2>
            <p class="text-zinc-400 text-center flex flex-col gap-2">
              <span>Learn how to get started with Nuxt Neon and build your next project with ease.</span>
              <span>
                Neon Postgres version:
                <code class="bg-zinc-800 px-2 py-1 rounded text-xs">{{ version }}</code>
              </span>
            </p>
          </div>
        </NuxtLink>
        <div class="grid md:grid-cols-2 gap-6 w-full max-w-3xl">
          <NuxtLink to="https://nuxt.com/docs/getting-started/introduction" class="bg-zinc-900 rounded-lg p-6 border border-zinc-800 hover:border-green-400">
            <div class="flex items-start space-x-4">
              <div class="bg-zinc-800 p-2 rounded-lg">
                <Icon class="w-8 h-8 block" name="logos:nuxt-icon" />
              </div>
              <div>
                <h3 class="text-xl font-semibold mb-2">Nuxt Docs</h3>
                <p class="text-zinc-400">Discover our list of modules to supercharge your Nuxt project. Created by the
                  Nuxt team and community.</p>
              </div>
            </div>
          </NuxtLink>
          <NuxtLink to="https://neon.tech/docs/introduction" class="bg-zinc-900 rounded-lg p-6 border border-zinc-800 hover:border-green-400">
            <div class="flex items-start space-x-4">
              <div class="bg-zinc-800 p-2 rounded-lg">
                <Icon class="w-8 h-8 block" name="ph:files-duotone" />
              </div>
              <div>
                <h3 class="text-xl font-semibold mb-2">Neon Docs</h3>
                <p class="text-zinc-400">We highly recommend you take a look at the Neon documentation to level up your Postgres game.</p>
              </div>
            </div>
          </NuxtLink>
        </div>
      </div>
    </div>
</template>