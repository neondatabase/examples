<script setup lang="ts">
const { data: version } = await useFetch<any>('/api/version', {
  transform: (data) => data[0].version
})
</script>

<template>
  <Html>
    <Body class="bg-black text-white">
      <Welcome :version="version" />
    </Body>
  </Html>
</template>
