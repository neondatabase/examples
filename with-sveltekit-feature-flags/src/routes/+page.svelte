<script lang="ts">
  import '../app.css'

  import type { PageData } from './$types'

  export let data: PageData
</script>

<div class="w-screen h-screen flex flex-col items-center justify-center">
  {#if data.fast_payments}
    <div class="mb-6 w-full flex flex-col max-w-[300px]">
      <span class="font-semibold">Fast Payment Methods</span>
      <button class="mt-3 flex flex-col items-center border rounded w-full px-3 py-1">Pay via PayGM</button>
    </div>
  {/if}
  <form action="/" method="post" class="w-full flex flex-col max-w-[300px]">
    <span class="font-semibold">Pay with card</span>
    <input class="mt-3 w-full border px-2 py-1 rounded" type="text" placeholder="Full name on card" />
    <input class="mt-3 w-full border px-2 py-1 rounded" type="text" placeholder="1234 1234 1234 1234" />
    <div class="flex flex-row gap-x-2">
      <input class="w-1/2 border px-2 py-1 rounded" type="text" placeholder="MM/YY" />
      <input class="w-1/2 border px-2 py-1 rounded" type="text" placeholder="CVV" />
    </div>
  </form>
</div>
